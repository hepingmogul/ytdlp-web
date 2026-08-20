# Build Resources

将应用图标放在此目录下：

| 文件 | 用途 | 尺寸要求 |
|------|------|---------|
| `icon.ico` | Windows 应用图标 | 256x256，包含多尺寸 |
| `icon.icns` | macOS 应用图标 | 512x512 或 1024x1024 |
| `icon.png` | Linux 应用图标 | 512x512 |

## 生成图标

推荐使用 [electron-icon-builder](https://github.com/nickt/electron-icon-builder) 或在线工具从一张 1024x1024 的 PNG 源图生成所有格式：

```bash
# 从 1024x1024 的 icon.png 生成 ico 和 icns
npx electron-icon-builder --input=build/icon.png --output=build
```

## 注意

- 在未提供图标的情况下，electron-builder 会使用默认图标
- macOS 打包需要 `.icns` 格式图标
- Windows 打包需要 `.ico` 格式图标（建议包含 16x16, 32x32, 48x48, 256x256 多种尺寸）