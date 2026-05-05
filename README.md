# 急不可耐程序员的 Bevy 与 Rust 指南

> 中文翻译版 · [原文](https://aibodh.com/books/the-impatient-programmers-guide-to-bevy-and-rust/) · 作者：Febin John James

学习使用 Bevy 和 Rust 进行游戏开发，从零构建 2D 游戏。无需 Rust 前置知识。

## 内容

全书 **12 章**，涵盖：

| # | 章节 | 内容 |
|---|------|------|
| 1 | 让玩家诞生 | Bevy 设置、玩家移动、精灵动画、模块化 |
| 2 | 让世界诞生 | WFC 算法、过程化世界生成、瓦片地图系统 |
| 3 | 让数据流动 | 数据驱动角色、RON 配置、通用动画引擎 |
| 4 | 让碰撞发生 | 游戏状态管理、CharacterState 模式、碰撞系统 |
| 5 | 让拾取发生 | 背包系统、借用检查器、平滑摄像机跟随 |
| 6 | 让粒子飞舞 | 粒子系统、WGSL 着色器、法术系统 |
| 7 | 让敌人出现 | A\* 寻路、AI 系统、敌人战斗 |
| 8 | 要有伤害 | 生命值/伤害系统、战斗事件、血条 UI |
| 9 | 让世界扩展 | 多区块拼接地图、异步生成、超大世界 |
| 10 | 要有存档 | 游戏存档/读档、bincode 序列化、UI |
| 11 | 要有声音 | 背景音乐与音效、Bevy 音频系统 |
| 12 | 让联网实现 | SpacetimeDB 多人联网 |

**第 1-7 章和第 12 章**：基于原文翻译。  
**第 8-11 章**：基于公开的 [GitHub 源码](https://github.com/jamesfebin/ImpatientProgrammerBevyRust) 重构编写。

## 文件结构

```
├── book.toml              # mdbook 配置
├── build.sh               # 一键构建脚本（mdbook + EPUB）
├── README.md              # 本文件
├── src/
│   ├── SUMMARY.md         # mdbook 目录
│   ├── index.md           # 前言页（书籍封面 + 简介）
│   ├── assets/            # 96 张本地图片
│   │   ├── book_assets/   # 截图、演示 GIF、书籍封面
│   │   └── generated/     # SVG 漫画 + D2 架构图
│   ├── chapter-01.md ~ 12.md
├── theme/
│   ├── index.hbs          # HTML 模板
│   ├── custom.css         # 样式（mdbook + EPUB 共用）
│   ├── custom.js          # 悬浮目录交互
│   ├── epub-vars.css      # EPUB 变量定义（让 custom.css 兼容 EPUB）
│   └── epub-metadata.yaml # EPUB 元数据
└── build/
    ├── book/              # mdbook 构建输出
    └── 急不可耐程序员的Bevy与Rust指南.epub
```

## 在线阅读

使用 mdbook：

```bash
cd bevy-rust-impatient-guide-zh
mdbook serve --open
```

访问 `http://localhost:3000` 即可在浏览器阅读。

## EPUB（手机阅读）

```bash
cd bevy-rust-impatient-guide-zh
pandoc src/index.md src/chapter-*.md \
  --metadata-file=/tmp/epub-metadata.yaml \
## 构建

```bash
# 一键构建 mdbook + EPUB
./build.sh

# 或单独运行
mdbook serve --open    # 本地预览（输出到 build/book/）
```

## EPUB（手机阅读）

EPUB 文件在 `build/` 目录下，可直接导入 iBooks、多看阅读、微信读书等 App。

## 许可

- 原文内容 © 2026 AIBodh. 保留所有权利。
- 中文翻译仅供学习参考。
- 示例代码基于 MIT 许可。
