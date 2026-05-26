# 塔罗之眼 iOS App 说明

这份工程已经把现有网站包装成一个 iOS App 工程，可以继续在 Xcode 里调试、打包和上架。

## 当前状态

- App 名称：塔罗之眼
- Bundle ID：com.tarotwheel.app
- 技术方案：Capacitor iOS 外壳 + 现有网页代码
- 线上接口来源：https://tarotwheel.vercel.app
- 已加入原生每日提醒能力，用户可在 iOS App 的今日神谕页开启每天 9:00 提醒。

现在的 iOS App 会使用本地打包进去的页面，同时把 `/api/...` 请求转到线上 Vercel 接口。这样本地 App 不需要自己带一套后端。

## 常用操作

准备 iOS 网页包：

```bash
npm run ios:prepare
```

生成 iOS 图标和启动页素材：

```bash
npm run ios:assets
```

同步到 iOS 工程：

```bash
npm run ios:sync
```

打开 Xcode：

```bash
npm run ios:open
```

## 如果打不开 Xcode

如果终端提示当前只有 Command Line Tools，需要先安装完整 Xcode。安装后可以执行：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

然后再运行：

```bash
npm run ios:open
```

## 下一步建议

1. 在 Xcode 里设置 Apple Developer Team，确认真机可以安装。
2. 做结果图片分享、抽牌记录本地保存等更多 App 原生体验。
3. 准备隐私政策、支持链接和 App Store 截图。

目前它已经是一个可继续开发的 iOS 工程，但还不是最终可上架版本。
