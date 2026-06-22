# Changelog

## [0.6.1](https://github.com/alem0n/MinerU-PDFScanner/compare/v0.6.0...v0.6.1) (2026-06-22)


### Bug Fixes

* tauri-action 使用 PAT 上传 Release 资产 ([addfa69](https://github.com/alem0n/MinerU-PDFScanner/commit/addfa690e45ec98c8db0792ff4d77e05ac2d52f7))
* 关闭 updater 签名，TAURI_SIGNING_PRIVATE_KEY 未配置 ([82282cb](https://github.com/alem0n/MinerU-PDFScanner/commit/82282cb395e90229ea072d1a54c38ab32484b010))
* 同时检查 WINDOWS_CERTIFICATE_PASSWORD 是否为空 ([9ef9a7a](https://github.com/alem0n/MinerU-PDFScanner/commit/9ef9a7a899de2ba5db54e311125bdf3682f867e3))
* 未配置 Windows 证书时跳过代码签名步骤 ([661e58f](https://github.com/alem0n/MinerU-PDFScanner/commit/661e58f6059339d1c22fda8c8d2be5d439a87565))
* 移除 if 中 secrets 引用，改用 try-catch 跳过证书导入 ([eff16dc](https://github.com/alem0n/MinerU-PDFScanner/commit/eff16dc5fef2abe5e41be1aa074cbb2371dbd86c))
* 移除无用的签名 env 变量和证书时间戳配置 ([d2f8c0d](https://github.com/alem0n/MinerU-PDFScanner/commit/d2f8c0d9fc4b932ed641c9d15013fdcc6dc5e573))
* 移除硬编码的证书指纹，解决 signtool 签名失败 ([697e7c6](https://github.com/alem0n/MinerU-PDFScanner/commit/697e7c6b93e6ddaaab7593c65182ac4e8ad6f363))

## [0.6.0](https://github.com/alem0n/MinerU-PDFScanner/compare/v0.5.0...v0.6.0) (2026-06-22)


### Features

* add github action ([7bd46c4](https://github.com/alem0n/MinerU-PDFScanner/commit/7bd46c4ffbbd86b450f7f2182aae61a839842490))
* add macos ([56d0d8a](https://github.com/alem0n/MinerU-PDFScanner/commit/56d0d8a736abca584d8b6e5b90fff8ad19f1e3ae))
* add pdf.js preview ([f6e92d7](https://github.com/alem0n/MinerU-PDFScanner/commit/f6e92d76d81259011cd6854be3ea8a174e6bb8b8))
* add win sign ([7bd46c4](https://github.com/alem0n/MinerU-PDFScanner/commit/7bd46c4ffbbd86b450f7f2182aae61a839842490))
* direct release ([f31a4ee](https://github.com/alem0n/MinerU-PDFScanner/commit/f31a4ee04312da0106293a54debf354d2cf05362))
* **doc:** add doc website ([17d43aa](https://github.com/alem0n/MinerU-PDFScanner/commit/17d43aaf935014c66a1a1fdc62e2fbeedf103670))
* init ([2cafbdd](https://github.com/alem0n/MinerU-PDFScanner/commit/2cafbdd35af9f346ae31985135d669fa3958c366))
* markdonw支持图片查看，方法 ([ec6efe8](https://github.com/alem0n/MinerU-PDFScanner/commit/ec6efe8d4631cbd672d914715b092e9796e0af62))
* 发布版本 ([f3075aa](https://github.com/alem0n/MinerU-PDFScanner/commit/f3075aa16aa816a5be70ba8eedc54d6677992683))
* 增加markdon打包（包含图片） ([0295795](https://github.com/alem0n/MinerU-PDFScanner/commit/02957950f0e52d6d6864a580fe16a7ab67297d6b))
* 增加sqlite,增加task ([0bb5dd1](https://github.com/alem0n/MinerU-PDFScanner/commit/0bb5dd1b23537aa98fd30ae12f24ee5cbd2f7077))
* 增加手工操作 ([183bd07](https://github.com/alem0n/MinerU-PDFScanner/commit/183bd07e7b07e709335e3db8251e73bd22b78409))
* 增加手工操作 ([4c59287](https://github.com/alem0n/MinerU-PDFScanner/commit/4c592875e273a012c914d0dfcb9fa0ad4e4e5141))
* 增加接口可配置 ([15c9c70](https://github.com/alem0n/MinerU-PDFScanner/commit/15c9c7098d86e17cdc419d1dd4c66e18cddd67a2))
* 增加版本检测自动更新 ([bc3ff44](https://github.com/alem0n/MinerU-PDFScanner/commit/bc3ff44b362c9ab563e08320f7171621e103cd91))
* 添加图片放大查看 ([fe18539](https://github.com/alem0n/MinerU-PDFScanner/commit/fe1853919d8f98d2d80aa6201d4de61c06d5781a))
* 调整 ([722e871](https://github.com/alem0n/MinerU-PDFScanner/commit/722e871ba9940cc165467a3c165265707a2e82fa))
* 调整窗口名称 ([ea1018d](https://github.com/alem0n/MinerU-PDFScanner/commit/ea1018d2a7bfb2e3e8cea3a0f8a631f9ba51d088))


### Bug Fixes

* ... ([f96497c](https://github.com/alem0n/MinerU-PDFScanner/commit/f96497ce74fa70db77dac8b8bea6903b19379d1f))
* add postcss ([8144da0](https://github.com/alem0n/MinerU-PDFScanner/commit/8144da0457dbaa78e3af81ca499ed95d296602b3))
* add release.json ([3747c26](https://github.com/alem0n/MinerU-PDFScanner/commit/3747c265a95ed8560745a4cfb5a25c688f1b9e7c))
* any error ([dcc97f2](https://github.com/alem0n/MinerU-PDFScanner/commit/dcc97f21090fc5f72a2496b8de5f8f84553633fc))
* config error ([73d8265](https://github.com/alem0n/MinerU-PDFScanner/commit/73d8265ec6e59f77eda4ffa095e1409544f19e6b))
* correct upload URL in task creation form ([f360ad5](https://github.com/alem0n/MinerU-PDFScanner/commit/f360ad549e7376e9b36cbcaea52fe82e6bdf007b))
* **doc/website:** 修复灯箱不可用 ([8c455bb](https://github.com/alem0n/MinerU-PDFScanner/commit/8c455bb6624cdc9f22cb184cd7447054322bb3b1))
* **docs/website:** 修复github链接错误 ([07958df](https://github.com/alem0n/MinerU-PDFScanner/commit/07958df777728a5ae23f9915172ee29c1cad5d07))
* fix bun action ([3ce4ce8](https://github.com/alem0n/MinerU-PDFScanner/commit/3ce4ce82328f8f0fda3741e15ada23150e66b3b5))
* fix env ([08e2a98](https://github.com/alem0n/MinerU-PDFScanner/commit/08e2a987c73f94c6703bf4f9aa232073744350b3))
* fixed production name ([501d538](https://github.com/alem0n/MinerU-PDFScanner/commit/501d53891b97c76c570c822edd999688ea2c322c))
* release-please 使用 MY_RELEASE_PLEASE_TOKEN PAT 以获取 PR 创建权限 ([aa7876e](https://github.com/alem0n/MinerU-PDFScanner/commit/aa7876e2db7750a5b861c86771f260dd76c3bc6f))
* release-please 改用 GITHUB_TOKEN 替代未配置的 MY_RELEASE_PLEASE_TOKEN secret ([5032766](https://github.com/alem0n/MinerU-PDFScanner/commit/50327663298b5ac3156100e6b24a9133c0d2db2f))
* remove autoprefixer ([3187e9e](https://github.com/alem0n/MinerU-PDFScanner/commit/3187e9edc2b04718f4af8b4e7db4bebd99d1d4a6))
* remove image tag ([a3c9e53](https://github.com/alem0n/MinerU-PDFScanner/commit/a3c9e537c72683a27af7d3319978c922961d49ca))
* remove macos ([fcb3753](https://github.com/alem0n/MinerU-PDFScanner/commit/fcb37536b59f92e0cd48b54a28a40bd99d1a1dea))
* test rust cache ([c674fda](https://github.com/alem0n/MinerU-PDFScanner/commit/c674fdaadbf4815ebecdebe1ea0167d7a69f9830))
* update doc ([45ddf33](https://github.com/alem0n/MinerU-PDFScanner/commit/45ddf33a2ffd3542dbc50759a4147672e97d3438))
* update PAT ([b2a725e](https://github.com/alem0n/MinerU-PDFScanner/commit/b2a725e6c4770f63c0b9a5cc16df8560455f000e))
* update trigger ([647e415](https://github.com/alem0n/MinerU-PDFScanner/commit/647e4150cafbd7b266519b6548e5414238580b69))
* use rust cache ([7e648ce](https://github.com/alem0n/MinerU-PDFScanner/commit/7e648cee291c1f082ed8ec107b219cad107b3e2b))
* 修复 GitHub Actions Linux 构建依赖 — Tauri v2 系统库 ([85d37eb](https://github.com/alem0n/MinerU-PDFScanner/commit/85d37eb6ca5a4309621b85870cbeb19697db5494))
* 修复 publish.yml 中 tauri-action 版本号 [@v2](https://github.com/v2) → [@v0](https://github.com/v0) ([2798d61](https://github.com/alem0n/MinerU-PDFScanner/commit/2798d61f768f623b791142602dfea50f9761f6dc))
* 修复pdfjs-dist ([1e89ccc](https://github.com/alem0n/MinerU-PDFScanner/commit/1e89ccc247477c2d9f33f0e37946d577f8ddb574))
* 修复双向同步 ([1863751](https://github.com/alem0n/MinerU-PDFScanner/commit/1863751089ce65b33544c34ad7bfe65d3f153c16))
* 修复图片路径错误 ([fe18539](https://github.com/alem0n/MinerU-PDFScanner/commit/fe1853919d8f98d2d80aa6201d4de61c06d5781a))
* 修复缓存冲突，增加打包下载 ([6a3da3d](https://github.com/alem0n/MinerU-PDFScanner/commit/6a3da3d348cb860ad7c3c4604e0f2287b0b9e5ce))
* 修复链接错误 ([1806cae](https://github.com/alem0n/MinerU-PDFScanner/commit/1806caee3bf66bf7f6c0ac68a843b477769f75a7))
* 修改出发 ([d4f5d54](https://github.com/alem0n/MinerU-PDFScanner/commit/d4f5d54ecf87228749f27ddbb29f270d39c4499e))
* 修正参数配置错误 ([ea1761a](https://github.com/alem0n/MinerU-PDFScanner/commit/ea1761a7f3265909e328b38a038f9c144758f27e))
* 调整release,修复bun ([be3162b](https://github.com/alem0n/MinerU-PDFScanner/commit/be3162b53b58dabb5f4965932fd7900184a4837a))
* 调整成bun ([e0cbf81](https://github.com/alem0n/MinerU-PDFScanner/commit/e0cbf81e3c82dd62c59584db5b847ef8f1950239))
* 调整成PAT，来触发publish ([7f264bc](https://github.com/alem0n/MinerU-PDFScanner/commit/7f264bcd6fe308f1f20e20afa6785be7af1e33be))
* 调整插件参数配置错误 ([e6420e3](https://github.com/alem0n/MinerU-PDFScanner/commit/e6420e33bc297a46c906987b0d10ab24d39df8fd))


### Performance Improvements

* 调整工作流，支持updater ([f8190c0](https://github.com/alem0n/MinerU-PDFScanner/commit/f8190c0e11716c15087aebf1cacb6359fe1e0d62))

## [0.5.0](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.4.4...v0.5.0) (2024-10-17)


### Features

* **doc:** add doc website ([17d43aa](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/17d43aaf935014c66a1a1fdc62e2fbeedf103670))
* 添加图片放大查看 ([fe18539](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/fe1853919d8f98d2d80aa6201d4de61c06d5781a))


### Bug Fixes

* ... ([f96497c](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/f96497ce74fa70db77dac8b8bea6903b19379d1f))
* add postcss ([8144da0](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/8144da0457dbaa78e3af81ca499ed95d296602b3))
* config error ([73d8265](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/73d8265ec6e59f77eda4ffa095e1409544f19e6b))
* correct upload URL in task creation form ([f360ad5](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/f360ad549e7376e9b36cbcaea52fe82e6bdf007b))
* **doc/website:** 修复灯箱不可用 ([8c455bb](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/8c455bb6624cdc9f22cb184cd7447054322bb3b1))
* **docs/website:** 修复github链接错误 ([07958df](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/07958df777728a5ae23f9915172ee29c1cad5d07))
* remove autoprefixer ([3187e9e](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/3187e9edc2b04718f4af8b4e7db4bebd99d1d4a6))
* update doc ([45ddf33](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/45ddf33a2ffd3542dbc50759a4147672e97d3438))
* 修复图片路径错误 ([fe18539](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/fe1853919d8f98d2d80aa6201d4de61c06d5781a))
* 修复链接错误 ([1806cae](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/1806caee3bf66bf7f6c0ac68a843b477769f75a7))
* 调整成bun ([e0cbf81](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/e0cbf81e3c82dd62c59584db5b847ef8f1950239))

## [0.4.4](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.4.3...v0.4.4) (2024-10-10)


### Bug Fixes

* test rust cache ([c674fda](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/c674fdaadbf4815ebecdebe1ea0167d7a69f9830))

## [0.4.3](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.4.2...v0.4.3) (2024-10-10)


### Bug Fixes

* fixed production name ([501d538](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/501d53891b97c76c570c822edd999688ea2c322c))
* use rust cache ([7e648ce](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/7e648cee291c1f082ed8ec107b219cad107b3e2b))

## [0.4.2](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.4.1...v0.4.2) (2024-10-10)


### Bug Fixes

* fix env ([08e2a98](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/08e2a987c73f94c6703bf4f9aa232073744350b3))

## [0.4.1](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.4.0...v0.4.1) (2024-10-10)


### Bug Fixes

* 修正参数配置错误 ([ea1761a](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/ea1761a7f3265909e328b38a038f9c144758f27e))
* 调整插件参数配置错误 ([e6420e3](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/e6420e33bc297a46c906987b0d10ab24d39df8fd))


### Performance Improvements

* 调整工作流，支持updater ([f8190c0](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/f8190c0e11716c15087aebf1cacb6359fe1e0d62))

## [0.4.0](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.3.1...v0.4.0) (2024-10-10)


### Features

* 增加版本检测自动更新 ([bc3ff44](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/bc3ff44b362c9ab563e08320f7171621e103cd91))
* 调整 ([722e871](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/722e871ba9940cc165467a3c165265707a2e82fa))

## [0.3.1](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.3.0...v0.3.1) (2024-10-10)


### Bug Fixes

* remove macos ([fcb3753](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/fcb37536b59f92e0cd48b54a28a40bd99d1a1dea))
* update PAT ([b2a725e](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/b2a725e6c4770f63c0b9a5cc16df8560455f000e))
* 调整成PAT，来触发publish ([7f264bc](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/7f264bcd6fe308f1f20e20afa6785be7af1e33be))

## [0.3.0](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.2.5...v0.3.0) (2024-10-10)


### Features

* add macos ([56d0d8a](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/56d0d8a736abca584d8b6e5b90fff8ad19f1e3ae))
* direct release ([f31a4ee](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/f31a4ee04312da0106293a54debf354d2cf05362))

## [0.2.5](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.2.4...v0.2.5) (2024-10-10)


### Bug Fixes

* 修复pdfjs-dist ([1e89ccc](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/1e89ccc247477c2d9f33f0e37946d577f8ddb574))

## [0.2.4](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.2.3...v0.2.4) (2024-10-10)


### Bug Fixes

* fix bun action ([3ce4ce8](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/3ce4ce82328f8f0fda3741e15ada23150e66b3b5))

## [0.2.3](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.2.2...v0.2.3) (2024-10-10)


### Bug Fixes

* update trigger ([647e415](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/647e4150cafbd7b266519b6548e5414238580b69))

## [0.2.2](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.2.1...v0.2.2) (2024-10-10)


### Bug Fixes

* 调整release,修复bun ([be3162b](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/be3162b53b58dabb5f4965932fd7900184a4837a))

## [0.2.1](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.2.0...v0.2.1) (2024-10-10)


### Bug Fixes

* 修改出发 ([d4f5d54](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/d4f5d54ecf87228749f27ddbb29f270d39c4499e))

## [0.2.0](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/compare/v0.1.0...v0.2.0) (2024-10-10)


### Features

* add github action ([7bd46c4](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/7bd46c4ffbbd86b450f7f2182aae61a839842490))
* add pdf.js preview ([f6e92d7](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/f6e92d76d81259011cd6854be3ea8a174e6bb8b8))
* add win sign ([7bd46c4](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/7bd46c4ffbbd86b450f7f2182aae61a839842490))
* init ([2cafbdd](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/2cafbdd35af9f346ae31985135d669fa3958c366))
* markdonw支持图片查看，方法 ([ec6efe8](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/ec6efe8d4631cbd672d914715b092e9796e0af62))
* 发布版本 ([f3075aa](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/f3075aa16aa816a5be70ba8eedc54d6677992683))
* 增加markdon打包（包含图片） ([0295795](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/02957950f0e52d6d6864a580fe16a7ab67297d6b))
* 增加sqlite,增加task ([0bb5dd1](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/0bb5dd1b23537aa98fd30ae12f24ee5cbd2f7077))
* 增加手工操作 ([183bd07](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/183bd07e7b07e709335e3db8251e73bd22b78409))
* 增加手工操作 ([4c59287](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/4c592875e273a012c914d0dfcb9fa0ad4e4e5141))
* 增加接口可配置 ([15c9c70](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/15c9c7098d86e17cdc419d1dd4c66e18cddd67a2))
* 调整窗口名称 ([ea1018d](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/ea1018d2a7bfb2e3e8cea3a0f8a631f9ba51d088))


### Bug Fixes

* add release.json ([3747c26](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/3747c265a95ed8560745a4cfb5a25c688f1b9e7c))
* any error ([dcc97f2](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/dcc97f21090fc5f72a2496b8de5f8f84553633fc))
* remove image tag ([a3c9e53](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/a3c9e537c72683a27af7d3319978c922961d49ca))
* 修复双向同步 ([1863751](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/1863751089ce65b33544c34ad7bfe65d3f153c16))
* 修复缓存冲突，增加打包下载 ([6a3da3d](https://github.com/liuhuapiaoyuan/MinerU-PDFScanner/commit/6a3da3d348cb860ad7c3c4604e0f2287b0b9e5ce))
