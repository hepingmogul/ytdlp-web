# 捆绑二进制

运行 `npm run bin:fetch` 会把当前平台的 `yt-dlp`、`ffmpeg`、`ffprobe` 下载到 `resources/bin/<platform-arch>/`。

应用**只使用这些文件**，不读取系统 PATH。

来源：
- yt-dlp：https://github.com/yt-dlp/yt-dlp/releases
- Windows / Linux ffmpeg：https://github.com/yt-dlp/FFmpeg-Builds
- macOS ffmpeg：https://github.com/eugeneware/ffmpeg-static/releases
