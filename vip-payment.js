/* VIP payment: order, claim, verification, and unlock flow. Loaded before script.js. */

function setVipOrderStatus(text, meta = "") {
  const box = document.getElementById("vipOrderStatusBox");
  const textEl = document.getElementById("vipOrderStatusText");
  const metaEl = document.getElementById("vipOrderMeta");
  if (box) box.style.display = "block";
  if (textEl) textEl.textContent = text;
  if (metaEl) metaEl.textContent = meta;
}

function setVipCodeHint(text, isError = false) {
  const hint = document.getElementById("vipCodeHint");
  if (!hint) return;
  hint.textContent = text;
  hint.classList.toggle("error", isError);
}

function setManualPaymentClaimVisible(visible = false) {
  const box = document.getElementById("manualPaymentClaimBox");
  if (box) box.style.display = visible ? "grid" : "none";
}

function setManualPaymentClaimHint(text = "", isError = false) {
  const hint = document.getElementById("manualPaymentClaimHint");
  if (!hint) return;
  hint.textContent = text;
  hint.classList.toggle("error", isError);
}

function resetManualPaymentClaimForm() {
  ["manualPayerNameInput", "manualPaidAtInput", "manualContactInput", "manualPaymentNoteInput"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  setManualPaymentWaiting(false);
  setManualPaymentClaimHint("");
}

function setManualPaymentWaiting(isWaiting = false) {
  const box = document.getElementById("manualPaymentWaitingBox");
  const submitBtn = document.getElementById("submitManualPaymentClaimBtn");
  if (box) box.style.display = isWaiting ? "grid" : "none";
  if (submitBtn) {
    submitBtn.disabled = isWaiting;
    submitBtn.textContent = isWaiting ? "付款信息已提交" : "我已付款，提交确认";
  }
}

function stopVipOrderPolling() {
  if (vipOrderPollingTimer) {
    clearInterval(vipOrderPollingTimer);
    vipOrderPollingTimer = null;
  }
  vipOrderStatusRequestPending = false;
  vipAutoUnlockPending = false;
  currentVipPaymentMode = "static_qr";
  setManualPaymentClaimVisible(false);
  localStorage.removeItem(VIP_ORDER_ID_KEY);
  localStorage.removeItem(VIP_CLAIMED_ORDER_ID_KEY);
}

function getVipProductTypeForMode(mode = activeReadingMode) {
  return mode === "compatibility" ? "compatibility" : "deep";
}

function formatOrderExpireTime(expiresAt) {
  const ts = Number(expiresAt || 0);
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function createVipPaymentOrder(productType = getVipProductTypeForMode()) {
  const response = await fetchWithTimeout("/api/vip-payment-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productType })
  }, VIP_ORDER_REQUEST_TIMEOUT_MS);
  if (!response.ok) {
    let message = "创建支付订单失败";
    try {
      const data = await response.json();
      message = data?.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

async function fetchVipPaymentOrderStatus(orderId) {
  const response = await fetchWithTimeout(`/api/vip-payment-status?orderId=${encodeURIComponent(orderId)}`, {
    method: "GET"
  }, VIP_ORDER_REQUEST_TIMEOUT_MS);
  if (!response.ok) {
    let message = "查询支付状态失败";
    try {
      const data = await response.json();
      message = data?.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

async function unlockVipPaymentOrder(orderId) {
  const response = await fetchWithTimeout("/api/vip-payment-unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId })
  }, VIP_ORDER_REQUEST_TIMEOUT_MS);
  if (!response.ok) {
    let message = "订单核销失败";
    try {
      const data = await response.json();
      message = data?.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

async function submitVipPaymentClaim(orderId, payload = {}) {
  const response = await fetchWithTimeout("/api/vip-payment-claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, ...payload, page: window.location.href })
  }, VIP_ORDER_REQUEST_TIMEOUT_MS);
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    throw new Error(data?.error || "提交付款信息失败");
  }
  return data;
}

function setVipContinueButtonState(text = "检查支付结果", disabled = false) {
  const btn = document.getElementById("confirmVipPaidBtn");
  if (!btn) return;
  btn.textContent = text;
  btn.disabled = disabled;
}

function getVipPaymentModeHint(mode = currentVipPaymentMode) {
  return mode === "alipay_precreate"
    ? "订单二维码，支付后自动确认"
    : "静态二维码，支付后需后台确认";
}

function setQrFallbackLink(qrContent = "", visible = false) {
  const link = document.getElementById("qrFallbackLink");
  if (!link) return;
  const content = String(qrContent || "").trim();
  if (!content || !visible) {
    link.style.display = "none";
    link.removeAttribute("href");
    return;
  }
  link.href = content;
  link.style.display = "inline-block";
}

function continueAfterVipUnlock(tokenData, message = "支付已确认，正在继续解牌。") {
  if (!tokenData?.token || !tokenData?.expiresAt) {
    throw new Error("解锁凭证无效");
  }
  sessionStorage.setItem(VIP_TOKEN_KEY, JSON.stringify({ token: tokenData.token, expiresAt: tokenData.expiresAt }));
  closeVipConfirmModal();
  closeVipModal();
  updateStatus(message);
  showEnergyEffect(true);
}

async function autoUnlockVipPaymentOrder(orderId, flowId = vipPaymentFlowId) {
  if (!orderId || vipAutoUnlockPending) return;
  vipAutoUnlockPending = true;
  setVipContinueButtonState("支付已确认，自动继续中…", true);
  try {
    const tokenData = await unlockVipPaymentOrder(orderId);
    if (flowId !== vipPaymentFlowId) return;
    continueAfterVipUnlock(tokenData);
  } catch (error) {
    if (flowId !== vipPaymentFlowId) return;
    vipAutoUnlockPending = false;
    setVipOrderStatus("状态：支付已确认，自动继续失败", error.message || "请点击下方按钮重试。");
    setVipContinueButtonState("重试继续", false);
    updateStatus("支付已确认，但自动继续失败。请点击“重试继续”。");
  }
}

function applyVipOrderStatus(order) {
  if (!order?.orderId) return;
  localStorage.setItem(VIP_ORDER_ID_KEY, order.orderId);
  if (order.paymentMode) currentVipPaymentMode = order.paymentMode;
  const amountText = formatFenPrice(order.amountFen || getUnlockPriceForMode());
  const expireText = formatOrderExpireTime(order.expiresAt);
  const metaParts = [`订单号 ${order.orderId}`, `${amountText}/次`, getVipPaymentModeHint()];
  if (expireText) metaParts.push(`有效至 ${expireText}`);
  if (order.precreateError && currentVipPaymentMode === "static_qr") metaParts.push("自动订单暂不可用");
  const meta = metaParts.join(" · ");

  if (order.status === "paid" || order.status === "unlocked") {
    setManualPaymentClaimVisible(false);
    setVipOrderStatus("状态：已确认支付", `${meta} · 系统正在自动继续解牌。`);
    setVipContinueButtonState(vipAutoUnlockPending ? "自动继续中…" : "支付已确认，自动继续", true);
    updateStatus("支付已确认，正在自动继续解牌。");
    autoUnlockVipPaymentOrder(order.orderId, vipPaymentFlowId);
    return;
  }

  if (order.status === "expired") {
    if (vipOrderPollingTimer) {
      clearInterval(vipOrderPollingTimer);
      vipOrderPollingTimer = null;
    }
    setManualPaymentClaimVisible(false);
    setVipOrderStatus("状态：订单已过期", `${meta} · 请重新发起支付订单。`);
    setVipContinueButtonState("订单已过期", true);
    updateStatus("当前支付订单已过期，请重新开启支付。");
    return;
  }

  const manualClaimSubmitted = currentVipPaymentMode !== "alipay_precreate" &&
    localStorage.getItem(VIP_CLAIMED_ORDER_ID_KEY) === order.orderId;
  const waitHint = currentVipPaymentMode === "alipay_precreate"
    ? "扫码完成后系统会自动检测支付结果。"
    : (manualClaimSubmitted ? "付款信息已提交，等待后台确认。" : "扫码后请提交付款信息，后台确认后会自动继续。");
  setManualPaymentClaimVisible(currentVipPaymentMode !== "alipay_precreate");
  setManualPaymentWaiting(manualClaimSubmitted);
  setVipOrderStatus(
    currentVipPaymentMode === "alipay_precreate" ? "状态：等待扫码支付" : (manualClaimSubmitted ? "状态：等待后台确认" : "状态：等待付款信息"),
    `${meta} · ${waitHint}`
  );
  setVipContinueButtonState(currentVipPaymentMode === "alipay_precreate" ? "检查支付结果" : "刷新确认状态", false);
}

async function refreshVipOrderStatus(orderId, { silent = false } = {}) {
  if (!orderId || vipOrderStatusRequestPending) return null;
  vipOrderStatusRequestPending = true;
  try {
    const order = await fetchVipPaymentOrderStatus(orderId);
    applyVipOrderStatus(order);
    if (order.status === "paid" || order.status === "unlocked" || order.status === "expired") {
      if (vipOrderPollingTimer) {
        clearInterval(vipOrderPollingTimer);
        vipOrderPollingTimer = null;
      }
    }
    return order;
  } catch (error) {
    if (!silent) {
      setVipOrderStatus("状态：查询失败", error.message || "暂时无法获取支付状态，请稍后再试。");
      setVipContinueButtonState("重新检查", false);
    }
    return null;
  } finally {
    vipOrderStatusRequestPending = false;
  }
}

function startVipOrderPolling(orderId) {
  if (!orderId) return;
  if (vipOrderPollingTimer) {
    clearInterval(vipOrderPollingTimer);
    vipOrderPollingTimer = null;
  }
  localStorage.setItem(VIP_ORDER_ID_KEY, orderId);
  refreshVipOrderStatus(orderId, { silent: true });
  vipOrderPollingTimer = setInterval(() => {
    refreshVipOrderStatus(orderId, { silent: true });
  }, VIP_ORDER_POLL_INTERVAL_MS);
}

async function prepareVipPaymentFlow() {
  vipPaymentFlowId += 1;
  const flowId = vipPaymentFlowId;
  stopVipOrderPolling();
  const priceFen = getUnlockPriceForMode(activeReadingMode, document.getElementById("spreadSelect")?.value || "");
  const qrImg = document.getElementById("qrImage");
  const codeInput = document.getElementById("vipCodeInput");
  updateVipUnlockSummary(activeReadingMode);
  if (qrImg) qrImg.src = VIP_STATIC_QR_URL;
  setQrFallbackLink("", false);
  if (codeInput) codeInput.value = "";
  resetManualPaymentClaimForm();
  setManualPaymentClaimVisible(false);
  setVipCodeHint("", false);
  setVipContinueButtonState("创建订单中…", true);
  setVipOrderStatus("状态：正在创建订单", `当前价格 ${formatFenPrice(priceFen)}/次，系统正在准备支付二维码。`);
  try {
    const order = await createVipPaymentOrder(getVipProductTypeForMode(activeReadingMode));
    if (flowId !== vipPaymentFlowId) return;
    if (qrImg) {
      qrImg.onerror = () => {
        if (order.paymentMode === "alipay_precreate" && order.qrContent) {
          setQrFallbackLink(order.qrContent, true);
          setVipOrderStatus("状态：二维码图片加载失败", "可点击二维码下方链接打开支付宝支付。支付完成后系统仍会自动检测。");
        }
      };
      qrImg.onload = () => setQrFallbackLink("", false);
      qrImg.src = order.qrUrl || VIP_STATIC_QR_URL;
    }
    applyVipOrderStatus(order);
    startVipOrderPolling(order.orderId);
  } catch (error) {
    if (flowId !== vipPaymentFlowId) return;
    if (qrImg) qrImg.src = VIP_STATIC_QR_URL;
    setQrFallbackLink("", false);
    setVipOrderStatus("状态：订单创建失败", `${error.message || "支付接口暂时不可用"}。你仍可使用口令解锁作为备用方案。`);
    setVipContinueButtonState("暂不可用", true);
  }
}

async function submitManualPaymentClaim() {
  const orderId = localStorage.getItem(VIP_ORDER_ID_KEY);
  if (!orderId) {
    setManualPaymentClaimHint("订单信息不存在，请重新打开支付弹窗。", true);
    return;
  }

  const payerName = document.getElementById("manualPayerNameInput")?.value?.trim() || "";
  const paidAtText = document.getElementById("manualPaidAtInput")?.value?.trim() || "";
  const contact = document.getElementById("manualContactInput")?.value?.trim() || "";
  const note = document.getElementById("manualPaymentNoteInput")?.value?.trim() || "";
  if (!payerName && !contact && !note) {
    setManualPaymentClaimHint("请至少填写付款备注/昵称、联系方式或补充说明之一。", true);
    return;
  }

  const btn = document.getElementById("submitManualPaymentClaimBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "提交中…";
  }
  setManualPaymentClaimHint("");
  try {
    const data = await submitVipPaymentClaim(orderId, { payerName, paidAtText, contact, note });
    localStorage.setItem(VIP_CLAIMED_ORDER_ID_KEY, orderId);
    setManualPaymentWaiting(true);
    setManualPaymentClaimHint(data.message || "已提交，等待后台确认。");
    setVipOrderStatus("状态：等待后台确认", "我已收到你的付款信息。确认收款后，页面会自动继续解牌。");
    setVipContinueButtonState("刷新确认状态", false);
    refreshVipOrderStatus(orderId, { silent: true });
  } catch (error) {
    setManualPaymentClaimHint(error.message || "提交失败，请稍后重试。", true);
  } finally {
    if (btn) {
      const isClaimed = localStorage.getItem(VIP_CLAIMED_ORDER_ID_KEY) === orderId;
      btn.disabled = isClaimed;
      btn.textContent = isClaimed ? "付款信息已提交" : "我已付款，提交确认";
    }
  }
}

function closeVipModal() {
  document.getElementById("vipModal").style.display = "none";
  closeVipConfirmModal();
  vipPaymentFlowId += 1;
  stopVipOrderPolling();
}

function clearVipConfirmCountdown() {
  if (vipConfirmCountdownTimer) {
    clearInterval(vipConfirmCountdownTimer);
    vipConfirmCountdownTimer = null;
  }
}

function updateVipConfirmButtonState() {
  const btn = document.getElementById("confirmVipContinueBtn");
  if (!btn) return;
  if (vipConfirmRemainingSeconds > 0) {
    btn.disabled = true;
    btn.textContent = `确认并继续（${vipConfirmRemainingSeconds}）`;
    return;
  }
  btn.disabled = false;
  btn.textContent = "确认并继续";
}

function openVipConfirmModal() {
  const modal = document.getElementById("vipConfirmModal");
  if (!modal) return;
  clearVipConfirmCountdown();
  vipConfirmRemainingSeconds = 2;
  updateVipConfirmButtonState();
  modal.style.display = "flex";
  vipConfirmCountdownTimer = setInterval(() => {
    vipConfirmRemainingSeconds -= 1;
    updateVipConfirmButtonState();
    if (vipConfirmRemainingSeconds <= 0) clearVipConfirmCountdown();
  }, 1000);
}

function closeVipConfirmModal() {
  clearVipConfirmCountdown();
  vipConfirmRemainingSeconds = 0;
  const modal = document.getElementById("vipConfirmModal");
  if (modal) modal.style.display = "none";
  updateVipConfirmButtonState();
}

async function confirmVipPaidAndContinue() {
  if (vipConfirmRemainingSeconds > 0) return;
  const orderId = localStorage.getItem(VIP_ORDER_ID_KEY);
  if (!orderId) {
    setVipOrderStatus("状态：缺少订单信息", "请重新发起支付订单，或使用口令解锁。");
    closeVipConfirmModal();
    return;
  }
  const btn = document.getElementById("confirmVipContinueBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "确认中…";
  }
  try {
    const tokenData = await unlockVipPaymentOrder(orderId);
    continueAfterVipUnlock(tokenData, "支付已确认，正在继续解牌。");
  } catch (error) {
    setVipOrderStatus("状态：尚未完成支付", error.message || "订单还未支付成功，请稍后再试。");
    closeVipConfirmModal();
  } finally {
    updateVipConfirmButtonState();
  }
}

function readVipToken() {
  try {
    const raw = sessionStorage.getItem(VIP_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.expiresAt) return null;
    if (!String(parsed.token).includes(".")) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hasValidVipToken() {
  const vip = readVipToken();
  if (!vip) return false;
  const stillValid = Date.now() < vip.expiresAt;
  if (!stillValid) {
    sessionStorage.removeItem(VIP_TOKEN_KEY);
    return false;
  }
  return true;
}

async function requestVipTokenByCode(code) {
  const endpoints = [
    { url: "/api/vip-verify", payload: { unlockCode: code } },
    { url: "/api/vip-test-code-verify", payload: { code } }
  ];

  for (const item of endpoints) {
    try {
      const response = await fetch(apiUrl(item.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload)
      });

      if (!response.ok) continue;
      const data = await response.json();
      if (data?.token && data?.expiresAt) return data;
    } catch {
      continue;
    }
  }

  throw new Error("口令无效或当前验证服务不可用");
}

async function submitVipCode() {
  const input = document.getElementById("vipCodeInput");
  const button = document.getElementById("submitVipCodeBtn");
  const code = String(input?.value || "").trim();
  if (!code) {
    setVipCodeHint("请先输入 VIP 口令或朋友测试码。", true);
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "验证中…";
  }

  try {
    const tokenData = await requestVipTokenByCode(code);
    sessionStorage.setItem(VIP_TOKEN_KEY, JSON.stringify({ token: tokenData.token, expiresAt: tokenData.expiresAt }));
    setVipCodeHint("校验通过，已为你解锁本次会话。", false);
    setVipOrderStatus("状态：已验证", "口令校验通过，现在可以继续解牌。");
    closeVipModal();
    showEnergyEffect(true);
  } catch (error) {
    setVipCodeHint(error.message || "口令校验失败，请重试。", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "口令解锁";
    }
  }
}

async function confirmVipOrderBeforeContinue() {
  const orderId = localStorage.getItem(VIP_ORDER_ID_KEY);
  if (!orderId) {
    setVipOrderStatus("状态：请先创建订单", "订单信息不存在，请重新打开支付弹窗。");
    return;
  }
  setVipContinueButtonState("检查中…", true);
  try {
    const order = await refreshVipOrderStatus(orderId);
    if (!order) return;
    if (order.status === "paid" || order.status === "unlocked") {
      openVipConfirmModal();
      return;
    }
    if (order.status === "expired") {
      setVipOrderStatus("状态：订单已过期", "请关闭弹窗后重新发起支付。");
      return;
    }
    const hint = currentVipPaymentMode === "alipay_precreate"
      ? "如果你刚完成扫码，请等待几秒后再次检查，或使用口令解锁。"
      : "如果你已付款，请先提交付款信息；后台确认后会自动继续。";
    setVipOrderStatus("状态：尚未确认支付", hint);
    setVipContinueButtonState("重新检查", false);
  } finally {
    const activeOrderId = localStorage.getItem(VIP_ORDER_ID_KEY);
    if (!activeOrderId) return;
    refreshVipOrderStatus(activeOrderId, { silent: true });
  }
}
