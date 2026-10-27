# 照片排版打印（photo-layout）

把照片按标准尺寸（1 寸 / 2 寸 / 6 寸 / 卡片……）自动排到 A4 纸上，导出打印就绪的 PDF。剪下来就是标准尺寸，不用再跟打印机的缩放选项搏斗。

<img width="1529" height="1537" alt="image" src="https://github.com/user-attachments/assets/51af0cd6-0c46-467d-b009-fa84d4116b0b" />

## 它解决什么问题

打过证件照的人大概都体会过：照片在 A4 上打出来不是大了就是小了。问题出在打印前的排版，照片要在纸上占多大、一张纸排几张、间距留多少，这些没人替你算。这个工具就干这一件事。

## 功能

- 导入 PDF（每页转成一张图，300dpi）或常见图片格式，可混用
- 照片尺寸内置：小 1 寸、1 寸、大 1 寸、小 2 寸、2 寸、5 寸、6 寸、7 寸、卡片（85.6×54mm），也支持自定义毫米
- 纸张支持 A4 / A3 / Letter / 自定义，横竖版可选
- 自动计算每页排几张，照片间带裁切线（长虚线 / 四角标记 / 关闭）
- 同图铺满（一张图复制 N 份）和多图混排都支持
- 照片会跟着相框自动转方向，竖照片横排省纸，剪完转正
- 导出打印就绪 PDF（尺寸精确到毫米），也可以直接唤起系统打印框
- PDF 导入时支持一键导出所有图片（ZIP）
- 深浅色主题，手机/平板/桌面都能用
- 全部处理在浏览器本地完成，照片不上传任何服务器

## 用法

**四步：导入、选纸、选尺寸、导出。**

导入支持 PDF 和常见图片格式。PDF 按页转成图片，300 dpi，打印出来不糊。纸张默认 A4，也可以选 A3、Letter 或者自己填。照片尺寸内置了小 1 寸、1 寸、大 1 寸、小 2 寸、2 寸、5 寸、6 寸、7 寸，还有标准卡片 85.6×54mm，都能改毫米数。

选完它自动算一张纸能排几张。比如 2 寸在 A4 上排 25 张，1 寸能排 49 张，照片之间带裁切线，沿着剪下来就是标准尺寸。
<img width="1280" height="900" alt="image" src="https://github.com/user-attachments/assets/f3beb137-52fc-4613-a728-9933cb84dca3" />
<img width="1280" height="900" alt="image" src="https://github.com/user-attachments/assets/c8b17259-4f52-41d6-b226-8c2003c11b7c" />
<img width="1571" height="1145" alt="image" src="https://github.com/user-attachments/assets/4b4daad5-a24f-49da-b0ca-c372e1422abd" />

## 使用注意

打印时选「实际大小 / 100%」，别选「适应页面」。选错了尺寸就不准了。

## 部署
### 飞牛用户：
应用中心 → 右上角"手动安装" → 选中 fpk 文件，装完桌面出现图标，点开就用。这个包 x86 和 ARM 通用

**默认端口号：3210**

### Docker（任何 NAS / 服务器）

```bash
npm ci && npm run build
docker compose -f deploy/docker-compose.yml up -d --build
```

访问 `http://主机IP:3210`。改动端口编辑 `deploy/docker-compose.yml`。

### 飞牛 fnOS（应用包 fpk）

应用中心 → 右上角「手动安装」→ 选 `fpk/dist/photo-layout_1.0.2_all.fpk`。
`platform=all`，x86 和 ARM 通用（运行时用官方多架构 nginx 镜像）。

自己构建 fpk：

```bash
npm ci
bash fpk/build-fpk.sh    # 产出 all/x86/arm 三个包到 fpk/dist/
```

打包规范依据 [飞牛开放平台文档](https://developer.fnnas.com/)，manifest 字段说明见 `fpk/manifest.base` 内注释。

## 开发

```bash
npm ci
npm run dev        # 开发服务器
npm test           # 单元测试（排版引擎 / 兼容补丁）
npm run build      # 生产构建
```

技术栈：Vite + TypeScript（无框架），pdfjs-dist 渲染 PDF，pdf-lib 生成 PDF，jszip 打包导出图片。排版引擎是纯函数（`src/engine/`），有单测覆盖尺寸精度。

## 浏览器兼容

pdf.js 用到不少很新的 API，`src/polyfills.ts` 里补了降级实现（含 pdf.js worker 线程）：
`Promise.try`、`Promise.withResolvers`、`Iterator`、Set 集合方法、`Uint8Array.toHex`、`Map.getOrInsert`。
构建目标设为 safari16（自动降级 `static {}` 等新语法）。实测 iOS 16 / iOS 18 / 桌面 Chrome、Safari 均正常。

另有一个错误自报横幅：初始化失败时页面顶部会显示红色报错卡片，截图即可定位问题。

## License

MIT
