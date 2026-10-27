#!/bin/bash
# 构建飞牛 fnOS 应用包（fpk），产出 all / x86 / arm 三个变体到 fpk/dist/
# 用法：先在仓库根 npm ci，然后执行 bash fpk/build-fpk.sh
set -e
cd "$(dirname "$0")/.."          # 仓库根
ROOT="$(pwd)"
FPK="$ROOT/fpk"
P="$FPK/.pkg"                    # 组装暂存目录

# 1) 前端生产构建
rm -rf "$ROOT/dist"
npx vite build >/dev/null

# 2) 组装暂存区
rm -rf "$P"
mkdir -p "$P/app/docker" "$P/app/ui/images" "$P/cmd" "$P/config" "$P/ui/images" "$P/wizard"
cp -R "$FPK/cmd/." "$P/cmd/"
cp -R "$FPK/config/." "$P/config/"
cp -R "$FPK/ui/." "$P/ui/"
cp -R "$FPK/wizard/." "$P/wizard/"
cp "$FPK/PhotoLayout.sc" "$P/"
cp "$FPK/icons/ICON_64.PNG" "$P/ICON.PNG"
cp "$FPK/icons/ICON_256.PNG" "$P/ICON_256.PNG"
cp "$P/ICON.PNG" "$P/app/ui/images/64.png"
cp "$FPK/icons/ICON_256.PNG" "$P/app/ui/images/256.png"

# 3) 应用本体：静态页 + nginx 配置（nginx 的 mime.types 没有 .mjs，必须显式映射）
cp -R "$ROOT/dist/." "$P/app/docker/html/"
cp "$ROOT/deploy/nginx.conf" "$P/app/docker/nginx.conf"
cp "$ROOT/deploy/docker-compose.fpk.yaml" "$P/app/docker/docker-compose.yaml"

# 4) app.tgz 与校验和
tar -czf "$P/app.tgz" -C "$P/app" .
if command -v md5sum >/dev/null 2>&1; then
  SUM=$(md5sum "$P/app.tgz" | cut -d' ' -f1)
else
  SUM=$(md5 -q "$P/app.tgz")
fi

# 5) 三个架构变体
mkdir -p "$FPK/dist"
for PLAT in all x86 arm; do
  sed "s/platform        = PLACEHOLDER/platform        = $PLAT/; s/checksum        =.*/checksum        = $SUM/" \
    "$FPK/manifest.base" > "$P/manifest"
  tar -czf "$FPK/dist/photo-layout_1.0.2_$PLAT.fpk" -C "$P" \
    manifest ICON.PNG ICON_256.PNG app.tgz cmd config ui wizard PhotoLayout.sc
done

echo "== 构建完成 =="
ls -la "$FPK/dist/"*.fpk
echo "checksum: $SUM"
