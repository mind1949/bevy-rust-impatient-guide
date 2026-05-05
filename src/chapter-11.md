# 第十一章：要有声音


![第11章演示](./assets/book_assets/chapter11-cover.png)

> **耐心程序员的 Bevy 与 Rust 指南：第十一章——要有声音**

*2026年3月*

![游戏音频系统演示](./assets/book_assets/chapter11/ch11.png)

> **关于 AI 辅助**
> *是的，本章写作过程中使用了 AI 辅助。我负责结构设计、技术决策、方法论、代码组织方式，以及整理学习者可能遇到的问题列表。AI 帮助扩展了结构和解释内容，并由我全程编辑。每章我总共花费约 20-25 小时，包括编码和写作。如果任何部分感觉不对劲，请在 [Reddit](https://www.reddit.com/r/bevy/) 或 [Discord](https://discord.com/invite/cD9qEsSjUH) 上告诉我，我会进行改进。*

> **前置条件**：本章是 Bevy 教程系列的第十一章，属于付费章节。加入我们的 [社区](https://discord.com/invite/cD9qEsSjUH) 以获取新章节发布通知。开始之前，请先完成第一章到第十章的内容，或从[此仓库](https://github.com/jamesfebin/ImpatientProgrammerBevyRust)克隆第十章作为起始代码。

> **开始之前：** *我一直在努力改进本教程，让您的学习之旅更加愉快。您的反馈至关重要——请在 [Reddit](https://www.reddit.com/r/bevy/)/[Discord](https://discord.com/invite/cD9qEsSjUH)/[LinkedIn](https://www.linkedin.com/in/febinjohnjames) 上分享您的困惑、问题或建议。喜欢本教程？请告诉我哪些地方对您有帮助！让我们一起让使用 Rust 和 Bevy 进行游戏开发变得更加易于上手。*

## 为什么声音如此重要？

闭上眼睛想一想你玩过的最后一款好游戏。你可能在脑海中看到了画面，但我打赌你也**听到**了什么——剑的铿锵声、背景音乐的旋律、拾取物品时清脆的"叮"声、角色受伤时的低沉撞击声。

声音是游戏的一半。它告诉你你的操作有了效果。它营造氛围。它提供反馈。当你的火球击中敌人时，如果没有爆炸声，一切都会感觉空洞而虚假。在某种意义上，声音是游戏世界的**触觉**——它让你感觉到事件确实在发生。

到目前为止，在我们的游戏中，一切都在**沉默**中发生。玩家发射火球——无声。火球击中敌人——无声。拾取物品——无声。感觉不对劲，对吧？

在这一章中，我们要改变这一切。我们将为游戏添加：

- **背景音乐**：菜单音乐和战斗音乐
- **音效（SFX）**：射击、命中、拾取、死亡、按钮点击等
- **状态驱动的音乐切换**：进入不同游戏状态时自动切换音乐
- **通过 Bevy 的 Observer 模式集成 SFX**：将声音与现有的事件系统无缝对接

开始之前，我们需要在 `Cargo.toml` 中启用音频编解码器支持。

## 启用音频格式

Bevy 内置了音频支持。但音频文件有不同的格式——MP3、WAV、OGG Vorbis——每一种都需要不同的解码库。Bevy 通过 Cargo features 让你选择需要哪些格式，这样你就不必为用不到的格式编译解码器。

```toml
[package]
name = "chapter11"
version = "0.1.0"
edition = "2024"

[dependencies]
bevy = { version = "0.18", features = ["mp3", "wav"] }
bevy_procedural_tilemaps = "0.3"
bevy_common_assets = { version = "0.15.0-rc.1", features = ["ron"] }
serde = { version = "1.0", features = ["derive"] }
rand = "0.8"
pathfinding = "4.9"
bincode = "1.3"
chrono = { version = "0.4", features = ["serde"] }
```

关键变化就一行：`features = ["mp3", "wav"]`。

你可能想问：**OGG 呢？** Bevy 默认启用 `ogg` 格式，所以你不必在 features 里声明它。`mp3` 和 `wav` 需要显式启用。大多数游戏都会用到这几种格式，所以我们的列表覆盖了绝大部分场景。

Bevy 的音频解码依赖底层库：
- MP3 → `minimp3`
- WAV → `hound`
- OGG → `vorbis`（默认启用）

> **TIP**：在你的实际项目中，可以根据音频资产的具体格式来选择 feature。如果只有 OGG 文件，你甚至不需要添加任何 audio features。但我们这里的资产混合使用了多种格式，所以把它们都加上最省心。

## 新的 crate 结构

我们创建一个新的 `audio` 模块，包含以下文件：

```
src/
├── audio/
│   ├── mod.rs          # AudioManagerPlugin
│   ├── assets.rs       # 音频资源加载
│   ├── music.rs        # 背景音乐系统
│   └── sfx.rs          # 音效系统
```

这个模块内部各司其职，但对外只暴露一个 Plugin。让我们逐一查看每个文件。

## 音频资源加载（`assets.rs`）

在任何系统播放声音之前，我们必须先把音频文件从磁盘加载到内存中。Bevy 使用 `AssetServer` 来处理这个问题——我们在前几章加载精灵纹理和 tilemap 数据时已经见过它了。

```rust
// src/audio/assets.rs
use bevy::prelude::*;

#[derive(Resource)]
pub struct AudioAssets {
    pub menu_music: Handle<AudioSource>,
    pub battle_music: Handle<AudioSource>,
    pub spell_generic: Handle<AudioSource>,
    pub spell_fire: Handle<AudioSource>,
    pub enemy_shoot: Handle<AudioSource>,
    pub hit: Handle<AudioSource>,
    pub player_death: Handle<AudioSource>,
    pub enemy_death: Handle<AudioSource>,
    pub pickup: Handle<AudioSource>,
    pub button_click: Handle<AudioSource>,
    pub jump: Handle<AudioSource>,
}

pub fn load_audio_assets(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.insert_resource(AudioAssets {
        menu_music: asset_server.load("audio/music/menu_ambient.mp3"),
        battle_music: asset_server.load("audio/music/battle_theme.ogg"),
        spell_generic: asset_server.load("audio/sfx/spell_01.ogg"),
        spell_fire: asset_server.load("audio/sfx/spell_fire.wav"),
        enemy_shoot: asset_server.load("audio/sfx/spell_enemy.ogg"),
        hit: asset_server.load("audio/sfx/hit.wav"),
        player_death: asset_server.load("audio/sfx/death_player.mp3"),
        enemy_death: asset_server.load("audio/sfx/death_enemy.mp3"),
        pickup: asset_server.load("audio/sfx/pickup.wav"),
        button_click: asset_server.load("audio/sfx/button_click.wav"),
        jump: asset_server.load("audio/sfx/jump.wav"),
    });
}
```

这个文件很简单，但有两个重要的设计点。

### `Handle<AudioSource>` 是什么？

在前几章中，我们使用 `Handle<Image>` 来引用纹理，用 `Handle<Mesh>` 来引用网格。这里的 `Handle<AudioSource>` 是同样的模式——它是一个**引用计数句柄**，指向 `AssetServer` 管理的一个音频资产。

Bevy 的 `AssetServer` 有一个重要特性：**它是懒惰加载的**。当你调用 `asset_server.load("path/to/file.mp3")` 时，它不会立即阻塞线程去读取文件。它会立即返回一个 `Handle`，并在后台启动加载。这个句柄一开始可能是"未就绪"状态，但当系统第一次尝试播放这个音频时，Bevy 会确保它在播放前已可用。

这种设计意味着：你可以在游戏启动时一口气发出所有加载命令，然后在之后的系统中使用这些句柄，无需等待。

### Asset 路径约定

注意路径的写法：`"audio/music/menu_ambient.mp3"`。这些路径是相对于 `AssetPlugin` 配置的根目录的。在第十章中，资产根目录被硬编码为 `"src/assets"`：

```rust
.set(AssetPlugin {
    file_path: "src/assets".into(),
    ..default()
})
```

因此，`asset_server.load("audio/music/menu_ambient.mp3")` 实际上会加载 `<项目根>/src/assets/audio/music/menu_ambient.mp3`。

> **注意**：路径中也包含了文件扩展名。这不仅是惯例——Bevy 依赖扩展名来确定使用哪个 `AssetLoader`。`.mp3` 触发 MP3 解码器，`.wav` 触发 WAV 解码器，`.ogg` 触发 OGG Vorbis 解码器。

### 音频资产文件夹结构

你的 `src/assets/` 文件夹现在应该有这样的结构：

```
src/assets/
├── audio/
│   ├── music/
│   │   ├── menu_ambient.mp3
│   │   └── battle_theme.ogg
│   └── sfx/
│       ├── spell_01.ogg
│       ├── spell_fire.wav
│       ├── spell_enemy.ogg
│       ├── hit.wav
│       ├── death_player.mp3
│       ├── death_enemy.mp3
│       ├── pickup.wav
│       ├── button_click.wav
│       └── jump.wav
```

将音频资产与代码分开组织是一个好习惯。清晰的分层结构让你在后期增加更多音效时能快速找到位置。

## 背景音乐系统（`music.rs`）

背景音乐和音效有一个根本区别：**音乐是持续存在的，会循环播放，并且需要在状态切换时被替换**。相比之下，音效通常是瞬时播放，播完即止。

我们需要一种方式来追踪当前正在播放的音乐，以便在需要时停止它。我们用 Bevy 的 **Component** 作为标记来实现：

```rust
// src/audio/music.rs
use bevy::prelude::*;
use super::assets::AudioAssets;

/// Marker for music entities so we can find and stop them.
#[derive(Component)]
pub struct MusicTrack;

pub fn start_menu_music(
    mut commands: Commands,
    audio_assets: Option<Res<AudioAssets>>,
    existing: Query<Entity, With<MusicTrack>>,
) {
    // 1. Stop any currently playing music
    for entity in existing.iter() {
        commands.entity(entity).despawn();
    }

    // 2. Safely get our loaded audio assets
    let Some(audio) = audio_assets else { return; };

    // 3. Spawn the new audio player
    commands.spawn((
        MusicTrack,
        AudioPlayer::new(audio.menu_music.clone()),
        PlaybackSettings::LOOP,
    ));
}

pub fn start_battle_music(
    mut commands: Commands,
    audio_assets: Option<Res<AudioAssets>>,
    existing: Query<Entity, With<MusicTrack>>,
) {
    for entity in existing.iter() {
        commands.entity(entity).despawn();
    }
    let Some(audio) = audio_assets else { return; };
    commands.spawn((
        MusicTrack,
        AudioPlayer::new(audio.battle_music.clone()),
        PlaybackSettings::LOOP,
    ));
}

pub fn stop_all_music(
    mut commands: Commands,
    existing: Query<Entity, With<MusicTrack>>,
) {
    for entity in existing.iter() {
        commands.entity(entity).despawn();
    }
}
```

这个模块的核心思想其实非常简单：**把音乐播放器当作一个带有标记组件的实体**。要切换音乐时，我们找到所有带有 `MusicTrack` 的实体，销毁它们，然后创建一个新的。

### `MusicTrack` —— 为什么需要这个标记？

如果你不销毁旧的音乐实体，会发生什么？菜单音乐会一直播放，甚至在战斗场景中仍然存在。同时，新的战斗音乐也会开始播放。你就会得到两段音乐同时响起——这在任何游戏中都是不可接受的。

`MusicTrack` 标记让我们能够精确地定位当前正在播放的音乐实体。Bevy 的 Query 系统可以高效地查找带有特定组件的所有实体：

```rust
existing: Query<Entity, With<MusicTrack>>
```

这行代码的意思是："找到所有带有 `MusicTrack` 组件的实体，只给我它们的 Entity ID。"

### `AudioPlayer` 和 `PlaybackSettings`

```rust
commands.spawn((
    MusicTrack,
    AudioPlayer::new(audio.menu_music.clone()),
    PlaybackSettings::LOOP,
));
```

我们向世界生成了一个包含三个组件的实体：

1. **`MusicTrack`** —— 我们的自定义标记组件
2. **`AudioPlayer::new(audio.menu_music.clone())`** —— Bevy 的音频播放器组件。它接收一个 `Handle<AudioSource>`，告诉 Bevy 要播放什么声音
3. **`PlaybackSettings::LOOP`** —— 播放配置，这里使用了预定义的 `LOOP` 设置，表示声音会无限循环

`PlaybackSettings` 是一个灵活的配置结构体。除了 `LOOP`，还有：
- `PlaybackSettings::ONCE` —— 播放一次就停止（适合音效）
- `PlaybackSettings::DESPAWN` —— 播放完成后自动销毁实体（非常适合音效）
- 你也可以自定义：`PlaybackSettings { mode: PlaybackMode::Loop, volume: 0.5, ..default() }` 来控制循环模式和音量等

### 安全处理 `AudioAssets`

你可能会注意到 `audio_assets: Option<Res<AudioAssets>>` 这个写法。为什么是 `Option`？

资源并非始终存在。虽然我们在 `Startup` 系统中调用了 `load_audio_assets` 来插入 `AudioAssets` 资源，但 `start_menu_music` 也可能在其他时机被调用（比如从暂停菜单返回主菜单时）。如果音频资产尚未加载完毕，`Res<AudioAssets>` 会是 `None`。

使用 `Option` 配合 `let Some(audio) = audio_assets else { return; };` 可以让系统优雅地跳过执行，而不会 panic。

## 音效系统（`sfx.rs`）

音效和音乐的处理方式不同。音乐是**状态驱动的**——当前游戏状态决定了应该播放哪首音乐。音效是**事件驱动的**——某个事件发生了，就播放对应的声音。

Bevy 0.18 引入了一种处理事件的新方式：**Observers（观察者）**。如果你用过其他框架中的观察者模式，你会感到很熟悉：一个事件被触发，所有注册的观察者都会响应。

```rust
// src/audio/sfx.rs
use bevy::prelude::*;
use crate::combat::PowerType;
use super::assets::AudioAssets;

#[derive(Event, Clone, Copy)]
pub enum SfxKind {
    PlayerShoot(PowerType),
    EnemyShoot,
    Hit,
    PlayerDeath,
    EnemyDeath,
    Pickup,
    ButtonClick,
    Jump,
}

pub fn on_sfx(
    trigger: On<SfxKind>,
    audio_assets: Option<Res<AudioAssets>>,
    mut commands: Commands,
) {
    let Some(audio) = audio_assets else { return; };

    let handle = match *trigger.event() {
        SfxKind::PlayerShoot(PowerType::Fire) => audio.spell_fire.clone(),
        SfxKind::PlayerShoot(_) => audio.spell_generic.clone(),
        SfxKind::EnemyShoot => audio.enemy_shoot.clone(),
        SfxKind::Hit => audio.hit.clone(),
        SfxKind::PlayerDeath => audio.player_death.clone(),
        SfxKind::EnemyDeath => audio.enemy_death.clone(),
        SfxKind::Pickup => audio.pickup.clone(),
        SfxKind::ButtonClick => audio.button_click.clone(),
        SfxKind::Jump => audio.jump.clone(),
    };

    commands.spawn((AudioPlayer::new(handle), PlaybackSettings::DESPAWN));
}
```

### `SfxKind` —— 带数据的 Event

`SfxKind` 是一个枚举，其中一些变体带有数据。例如 `PlayerShoot(PowerType)` —— 玩家发射的魔力类型不同，我们想要播放不同的声音（火焰魔法 vs 通用魔法）。

`#[derive(Event, Clone, Copy)]` 是必要的：
- `Event` 告诉 Bevy 这个类型可以作为观察者事件使用
- `Clone` 和 `Copy` 是必需的，因为事件触发时 Bevy 可能会复制它

### 观察者函数签名

```rust
pub fn on_sfx(
    trigger: On<SfxKind>,
    audio_assets: Option<Res<AudioAssets>>,
    mut commands: Commands,
)
```

这是 Bevy 观察者系统的标准签名。第一个参数始终是 `On<T>`，它包含被触发的事件。你可以通过 `trigger.event()` 获取事件引用。

这种模式的优点：
- **松耦合**：`audio` 模块不需要知道是谁触发了事件。它只需要知道该播放什么声音
- **类型安全**：编译器会检查你触发的事件类型是否正确
- **异步**：触发者不需要等待音效播放完毕

### `PlaybackSettings::DESPAWN`

这个配置和音乐中的 `LOOP` 不同。对于音效，我们希望在播放完毕后自动清理实体：

```rust
commands.spawn((AudioPlayer::new(handle), PlaybackSettings::DESPAWN));
```

`DESPAWN` 是 Bevy 提供的一个便捷配置：音效播放完成后，实体自动从世界中移除。这意味着我们不需要手动管理音效实体的生命周期——它们播放完毕后就会自我清理。

### 模式匹配的灵活性

`match` 语句展示了 Rust 模式匹配的强大。

当 `PlayerShoot` 携带 `PowerType::Fire` 时，播放火焰法术音效：
```rust
SfxKind::PlayerShoot(PowerType::Fire) => audio.spell_fire.clone(),
```

任何其他魔力类型（Arcane、Shadow、Poison）都回退到通用法术音效：
```rust
SfxKind::PlayerShoot(_) => audio.spell_generic.clone(),
```

这让你可以轻松地为特定行为添加独特的音效，同时为其他情况提供合理的默认值。

## 组装 `AudioManagerPlugin`（`mod.rs`）

现在，我们把所有模块组合成一个插件：

```rust
// src/audio/mod.rs
mod assets;
mod music;
mod sfx;

pub use sfx::SfxKind;

use crate::state::GameState;
use bevy::prelude::*;

pub struct AudioManagerPlugin;

impl Plugin for AudioManagerPlugin {
    fn build(&self, app: &mut App) {
        app
            // SFX handled via global observer
            .add_observer(sfx::on_sfx)

            // Start loading assets and music on app startup
            .add_systems(
                Startup,
                (assets::load_audio_assets, music::start_menu_music).chain(),
            )

            // Music follows game state.
            .add_systems(OnEnter(GameState::MainMenu), music::start_menu_music)
            .add_systems(OnEnter(GameState::Playing), music::start_battle_music)
            .add_systems(OnEnter(GameState::GameOver), music::stop_all_music);
    }
}
```

这个插件做了三件事：

### 1. 注册 SFX 观察者

```rust
.add_observer(sfx::on_sfx)
```

这告诉 Bevy：每当 `SfxKind` 事件被触发时，调用 `sfx::on_sfx` 函数。这是一个**全局观察者**——你在应用中的任何地方、任何系统中 `trigger` 这个事件，它都会被捕获。

### 2. 启动时加载资产并播放菜单音乐

```rust
.add_systems(
    Startup,
    (assets::load_audio_assets, music::start_menu_music).chain(),
)
```

这里使用了 `.chain()`，这意味着两个系统按顺序运行。先加载音频资产，然后启动菜单音乐。

不过，这里有一个微妙之处需要理解：`asset_server.load()` 是异步的。当你调用它时，Bevy 立即返回一个 `Handle`，但实际的音频数据可能还没有加载完成。当 `start_menu_music` 系统运行时，`AudioAssets` 资源已经存在（因为 `load_audio_assets` 插入它了），但其中的 `Handle` 可能还没有绑定到实际的音频数据。

Bevy 的处理方式很聪明：当你生成一个带有 `AudioPlayer` 和 `Handle<AudioSource>` 的实体时，Bevy 内部会在数据可用之前保持静默，然后在数据加载完毕后自动开始播放。所以你不需要手动等待。

### 3. 游戏状态驱动音乐切换

```rust
.add_systems(OnEnter(GameState::MainMenu), music::start_menu_music)
.add_systems(OnEnter(GameState::Playing), music::start_battle_music)
.add_systems(OnEnter(GameState::GameOver), music::stop_all_music);
```

这是本章中最优美的设计之一。Bevy 的状态系统允许你在**进入某个状态时**自动运行系统。

- **进入主菜单** → 播放菜单音乐（并停止任何正在播放的音乐）
- **进入游戏** → 切换到战斗音乐
- **游戏结束** → 停止所有音乐

因为 `start_menu_music`、`start_battle_music` 和 `stop_all_music` 都会先销毁已存在的 `MusicTrack` 实体，所以音乐切换是干净的——不会有重叠。

### 导出 `SfxKind`

```rust
pub use sfx::SfxKind;
```

这行代码很关键。`SfxKind` 是在 `sfx` 模块中定义的，但其他模块（如 `combat`、`inventory`、`state`）需要能够触发它。通过 `pub use`，我们将其提升到 `audio` crate 的公共 API 层面，外部模块可以这样使用：

```rust
use crate::audio::SfxKind;
```

而不需要知道内部模块结构。

## 将 SFX 连接到游戏系统

这是最有趣的部分。我们需要遍历游戏的各个系统，在适当的位置插入 `commands.trigger(SfxKind::...)` 调用。让我们逐一看看。

### 玩家射击

在 `src/combat/systems.rs` 中，当玩家按下 Ctrl 键发射投射物时：

```rust
// src/combat/systems.rs (片段)
pub fn handle_power_input(
    // ...
) {
    // ... 冷却检查、方向计算 ...

    spawn_projectile(&mut commands, spawn_position, combat.power_type, &visuals, ProjectileOwner::Player);

    commands.trigger(SfxKind::PlayerShoot(combat.power_type));
    info!("{:?} projectile fired!", combat.power_type);
}
```

注意我们是如何传递 `combat.power_type` 的。`SfxKind::PlayerShoot(PowerType)` 让 SFX 系统可以根据魔力类型选择不同的音效，而触发者无需知道具体的音效选择逻辑。

### 射击命中

在 `src/combat/observers.rs` 中，当 `ProjectileHit` 事件发生时：

```rust
// src/combat/observers.rs (片段)
pub fn on_projectile_hit(
    hit: On<ProjectileHit>,
    // ...
) {
    // ... 计算伤害 ...

    health.take_damage(&mut commands, hit.target, hit.damage);

    commands.trigger(SfxKind::Hit);

    info!(
        "{:?} hit for {} damage! HP: {:.0}/{:.0}",
        hit.power_type, hit.damage, health.current, health.max
    );
}
```

有意思的是，这里我们是在**观察者内部触发另一个事件**。`on_projectile_hit` 本身是一个观察者（响应 `ProjectileHit`），然后它又触发了 `SfxKind::Hit`，这个事件又被 `sfx::on_sfx` 观察者捕获。这种**事件链**是完全合法的，也是 Bevy 观察者系统的特色。

### 敌人射击

在 `src/enemy/combat.rs` 中，敌人 AI 攻击玩家时：

```rust
// src/enemy/combat.rs (片段)
pub fn enemy_attack(
    // ...
) {
    // ... 距离检查、冷却检查 ...

    spawn_projectile(&mut commands, spawn_position, combat.power_type, &visuals, ProjectileOwner::Enemy);

    commands.trigger(SfxKind::EnemyShoot);
    // ...
}
```

### 实体死亡

在 `src/combat/observers.rs` 中，当实体死亡时：

```rust
// src/combat/observers.rs (片段)
pub fn on_entity_death(
    death: On<EntityDeath>,
    // ...
) {
    let entity = death.entity;
    let is_player = players.get(entity).is_ok();

    info!("Entity {:?} defeated!", death.entity);
    commands.entity(death.entity).despawn();

    if is_player {
        info!("Player defeated! Game Over.");
        commands.trigger(SfxKind::PlayerDeath);
        next_state.set(GameState::GameOver);
    } else {
        commands.trigger(SfxKind::EnemyDeath);
    }
}
```

这里的关键设计是：**同一个事件观察者根据上下文触发不同的 SFX**。如果死亡实体是玩家，播放玩家死亡音效；如果是敌人，播放敌人死亡音效。SFX 观察者不需要知道是谁死了——它只需要知道该播放什么声音。

### 拾取物品

在 `src/inventory/systems.rs` 中，当玩家捡起物品时：

```rust
// src/inventory/systems.rs (片段)
pub fn handle_pickups(
    // ...
) {
    // ... 距离检测 ...

    for (entity, kind) in collected {
        commands.entity(entity).despawn();
        let count = inventory.add(kind);

        commands.trigger(SfxKind::Pickup);

        info!(
            " Picked up {} (total: {}) — inventory: {}",
            kind, count, inventory.summary()
        );
    }
}
```

### 菜单按钮点击

主菜单和暂停菜单中的按钮都触发了 `SfxKind::ButtonClick`。

在 `src/state/main_menu.rs` 中：

```rust
// src/state/main_menu.rs (片段)
pub fn handle_main_menu_buttons(
    // ...
) {
    for (interaction, button) in interaction_query.iter() {
        if *interaction != Interaction::Pressed {
            continue;
        }

        commands.trigger(SfxKind::ButtonClick);

        match button {
            MainMenuButton::NewGame => { next_state.set(GameState::Loading); }
            // ...
        }
    }
}
```

在 `src/state/pause.rs` 中：

```rust
// src/state/pause.rs (片段)
pub fn handle_pause_buttons(
    // ...
) {
    for (interaction, button) in interaction_query.iter() {
        if *interaction != Interaction::Pressed {
            continue;
        }

        commands.trigger(SfxKind::ButtonClick);

        match button {
            PauseButton::Resume => { next_state.set(GameState::Playing); }
            // ...
        }
    }
}
```

这种**一处触发，多处响应**的模式非常强大。音频系统不关心哪个按钮被点击了，也不关心点击后会发生什么——它只负责播放音效。

## 更新 `main.rs`

现在我们需要把所有内容串起来。`main.rs` 有两个变化：一是添加了 `mod audio` 和 `audio::AudioManagerPlugin`，二是引入了一个重要的新函数 `get_assets_path()`。

```rust
mod map;
mod characters;
mod state;
mod collision;
mod config;
mod inventory;
mod camera;
mod combat;
mod particles;
mod enemy;
mod save;
mod audio;    // ← 新增

use bevy::{
    prelude::*,
    window::{MonitorSelection, Window, WindowMode, WindowPlugin},
};

use bevy_procedural_tilemaps::prelude::*;
use crate::camera::CameraPlugin;
use crate::map::generate::{setup_generator, prepare_tilemap_handles_resource, poll_map_generation};
use crate::state::GameState;

fn get_assets_path() -> String {
    // Check for assets/ next to the executable first (release builds)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let exe_assets = exe_dir.join("assets");
            if exe_assets.exists() {
                return exe_assets.to_string_lossy().to_string();
            }
        }
    }
    // Fallback for `cargo run` from project root
    "src/assets".to_string()
}

fn main() {
    let assets_path = get_assets_path();
    App::new()
        .insert_resource(ClearColor(Color::BLACK))
        .add_plugins(
            DefaultPlugins
                .set(AssetPlugin {
                    file_path: assets_path.into(),
                    ..default()
                })
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Bevy Game".into(),
                        mode: WindowMode::BorderlessFullscreen(MonitorSelection::Current),
                        ..default()
                    }),
                    ..default()
                })
                .set(ImagePlugin::default_nearest()),
        )
        .add_plugins(state::StatePlugin)
        .add_plugins(CameraPlugin)
        .add_plugins(inventory::InventoryPlugin)
        .add_plugins(collision::CollisionPlugin)
        .add_plugins(characters::CharactersPlugin)
        .add_plugins(combat::CombatPlugin)
        .add_plugins(enemy::EnemyPlugin)
        .add_plugins(particles::ParticlesPlugin)
        .add_plugins(save::SavePlugin)
        .add_plugins(audio::AudioManagerPlugin)    // ← 新增
        .add_systems(Startup, prepare_tilemap_handles_resource)
        .add_systems(OnEnter(GameState::Loading), setup_generator)
        .add_systems(Update, poll_map_generation.run_if(in_state(GateState::Loading)))
        .run();
}
```

### `get_assets_path()` —— 发布构建的关键

在开发过程中，我们用 `cargo run` 从项目根目录运行，资产路径是 `"src/assets"`。这是第十章中的做法。

但在发布构建（release build）中，可执行文件可能被放在一个完全不同的目录中，`src/assets` 就不存在了。用户运行的是编译后的二进制文件，而不是从源码目录启动。

`get_assets_path()` 解决了这个问题：

1. 首先，它尝试获取当前可执行文件的路径
2. 然后检查可执行文件旁边是否有 `assets/` 目录
3. 如果找到了，就用那个路径（发布构建的场景）
4. 如果没找到，回退到 `"src/assets"`（开发场景）

```rust
fn get_assets_path() -> String {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let exe_assets = exe_dir.join("assets");
            if exe_assets.exists() {
                return exe_assets.to_string_lossy().to_string();
            }
        }
    }
    "src/assets".to_string()
}
```

然后 `assets_path` 被传给 `AssetPlugin`：

```rust
.set(AssetPlugin {
    file_path: assets_path.into(),
    ..default()
})
```

这样，你的发布构建结构看起来就像这样：

```
my_game.exe
assets/
├── audio/
│   ├── music/
│   └── sfx/
```

> **注意**：`std::env::current_exe()` 在 WASM 目标上不可用。如果你的游戏需要编译到 Web，你需要为 WASM 添加特殊处理。

## GameState 状态机概览

音乐切换依赖于 `GameState` 枚举。让我们快速回顾一下它的定义：

```rust
// src/state/game_state.rs
use bevy::prelude::*;

#[derive(States, Default, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GameState {
    #[default]
    MainMenu,
    Loading,
    Playing,
    Paused,
    GameOver,
}
```

音乐切换在三个状态入口处发生：

| 状态 | 动作 | 效果 |
|------|------|------|
| `OnEnter(MainMenu)` | 停止旧音乐，播放菜单音乐 | 玩家在菜单中时听到环境配乐 |
| `OnEnter(Playing)` | 停止旧音乐，播放战斗音乐 | 游戏进行时听到紧张刺激的战斗曲 |
| `OnEnter(GameOver)` | 停止所有音乐 | 游戏结束，一切归于沉寂 |

注意：`Paused` 状态没有音乐切换。暂停时音乐继续播放——这是合理的，因为玩家暂停后应该能听到背景音乐还在继续。

`GameOver` 时停止音乐是一种设计选择。在某些游戏中，你可能想在游戏结束时播放一段特殊的"失败"音乐。要实现这个效果，你只需要在 `OnEnter(GameOver)` 系统中触发一个不同的音乐即可。

## 理解 Bevy 的音频架构

现在我们已经完整实现了音频系统，让我们退后一步，理解 Bevy 的音频架构是如何工作的。

### Bevy 音频的核心概念

Bevy 的音频系统建立在几个支柱之上：

```
AudioSource (资产类型)
    ↓
AudioPlayer (组件，挂载在实体上)
    ↓
PlaybackSettings (组件，控制播放行为)
    ↓
Bevy 内部音频引擎 (基于 cpal/rodio)
    ↓
你的扬声器
```

1. **`AudioSource`** —— 一个资产类型，代表解码后的音频数据。就像 `Image` 代表像素数据一样。
2. **`AudioPlayer`** —— 一个组件，你把它附加到实体上，告诉 Bevy"这个实体应该播放这段音频"。
3. **`PlaybackSettings`** —— 一个组件，控制如何播放：是否循环、音量大小、播放速度等。
4. **Bevy 内部机制** —— Bevy 在每一帧检查所有带有 `AudioPlayer` 的实体，管理它们的播放状态。

### 为什么用实体来表示音频播放器？

你可能觉得用实体来表示"正在播放的声音"有点奇怪。但这是 Bevy ECS 设计理念的自然延伸：**一切皆实体，一切皆组件**。

用实体表示音频播放器有几个好处：

- **生命周期管理**：实体可以被 `despawn`（销毁），声音也随之停止
- **组件组合**：你可以给音频实体附加自定义组件（如 `MusicTrack`）来标记和查询
- **系统一致性**：音频播放和其他游戏逻辑使用相同的命令 API

### 观察者模式 vs 传统 Event

在 Bevy 0.18 中，有两种方式处理事件：

**传统 Event/EventReader/EventWriter**：
```rust
app.add_event::<MyEvent>();
// 发送: event_writer.send(MyEvent);
// 接收: mut reader: EventReader<MyEvent>
```

**Observer**：
```rust
app.add_observer(on_my_event);
// 发送: commands.trigger(MyEvent);
// 接收: trigger: On<MyEvent>
```

本章使用 Observer 模式处理 SFX，原因如下：

1. **直接触发**：`commands.trigger(SfxKind::Pickup)` 可以在任何系统中调用，不需要 `EventWriter` 参数
2. **自动清理**：Observer 不需要 `EventReader` 轮询，事件触发后立即处理
3. **链式触发**：一个 Observer 中可以触发另一个事件（如 `on_projectile_hit` 触发 `SfxKind::Hit`）

> **何时用传统 Event？** 当你需要在一帧中多次读取同一个事件，或者需要按顺序处理事件队列时，传统的 `EventReader` 更合适。

## 实战练习

现在你已经理解了音频系统的完整实现，这里有几个可以自己尝试的扩展：

### 1. 添加跳跃音效

游戏中已经有了 `SfxKind::Jump` 和 `jump.wav` 资产，但还没有在系统中触发它。找到玩家跳跃的代码位置，添加：

```rust
commands.trigger(SfxKind::Jump);
```

### 2. 实现音量控制

创建一个新的 `AudioSettings` 资源：

```rust
#[derive(Resource)]
pub struct AudioSettings {
    pub master_volume: f32,
    pub music_volume: f32,
    pub sfx_volume: f32,
}
```

然后在播放音乐和音效时应用音量设置。`PlaybackSettings` 接受 `volume` 字段：

```rust
PlaybackSettings {
    volume: settings.music_volume,
    ..PlaybackSettings::LOOP
}
```

### 3. GameOver 专属音乐

当前游戏结束时只是停止音乐。修改 `stop_all_music` 为 `start_game_over_music`，播放一段低沉的结束音乐。

### 4. 淡入淡出效果

使用 `AudioSink` 组件可以控制音量渐变：

```rust
pub fn fade_out_music(
    time: Res<Time>,
    mut sinks: Query<&mut AudioSink>,
) {
    for sink in sinks.iter_mut() {
        let new_volume = sink.volume() - time.delta_secs() * 0.5;
        if new_volume <= 0.0 {
            sink.stop();
        } else {
            sink.set_volume(new_volume);
        }
    }
}
```

## 常见问题

### Q: 音频文件加载失败，没有任何错误信息？

A: 检查资产路径是否正确。最常见的问题是发布构建中资产路径不对。确保你的 `assets/` 文件夹在可执行文件旁边。

### Q: 两段音乐同时播放？

A: 检查 `start_menu_music` 和 `start_battle_music` 是否有先销毁 `MusicTrack` 实体的逻辑。如果忘记销毁旧实体，新旧音乐会重叠。

```rust
// 必须的步骤
for entity in existing.iter() {
    commands.entity(entity).despawn();
}
```

### Q: SFX 没有声音？

A: 检查以下几点：
1. 是否在 `Cargo.toml` 中启用了正确的 audio features（`mp3`、`wav`）
2. `AudioAssets` 资源是否已正确插入
3. 观察者是否已注册：`app.add_observer(sfx::on_sfx)`
4. 文件路径中的扩展名是否正确？Bevy 根据扩展名选择解码器

### Q: 编译错误：`AudioPlayer` 找不到？

A: 确保你在使用 Bevy 0.18 或更新版本。`AudioPlayer` 是在 Bevy 0.18 中引入的。旧版本使用不同的 API（`AudioBundle`、`AudioSourceBundle`）。

## 本章小结

我们做到了。在这一章中，我们给原本沉默的游戏注入了声音。来回顾一下我们学到的：

**音频格式支持**
- 在 `Cargo.toml` 中通过 `features = ["mp3", "wav"]` 启用音频编解码器
- OGG Vorbis 默认启用，无需额外配置

**音频资产加载**
- 使用 `AudioAssets` 资源统一管理所有音频句柄
- `asset_server.load()` 的懒惰加载模式
- 路径约定和文件夹组织

**背景音乐系统**
- 用 `MusicTrack` 组件标记音乐实体
- 切换音乐时先销毁旧实体，再创建新实体
- 状态驱动的音乐切换：`OnEnter(MainMenu)` → 菜单音乐，`OnEnter(Playing)` → 战斗音乐，`OnEnter(GameOver)` → 停止音乐

**音效系统**
- 用 `SfxKind` 枚举和 Observer 模式处理事件驱动的音效
- `PlaybackSettings::DESPAWN` 自动清理播放完毕的音效
- 模式匹配根据事件类型选择不同音效

**事件集成**
- 在现有系统的关键位置插入 `commands.trigger(SfxKind::...)`
- 观察者内部可以触发其他事件，形成事件链
- 松耦合设计：音频系统不关心事件来源

**发布构建处理**
- `get_assets_path()` 函数根据运行环境选择资产路径
- 开发时使用 `src/assets`，发布时使用可执行文件旁边的 `assets/`

你现在不仅有了一个有声音的游戏——你还拥有了一个**设计良好**的音频系统。音频逻辑被封装在独立的模块中，通过清晰的 API（`SfxKind` 事件）与其他系统交互。你可以在不接触音频模块内部实现的情况下，在任意系统中触发音效。

声音让游戏变得生动。现在你的游戏既有画面又有声音，它开始真正像一个完整的游戏了。

在下一章中，我们将为游戏添加网络功能，让多个玩家能够在同一个世界中互动。敬请期待！

---

*想获得完整的章节和提前访问权限？请查看 Gumroad 上的[电子书](https://febinjohnjames.gumroad.com/l/the-impatient-programmers-guide-to-bevy-and-rust)。*
---

## 📂 查看本章源码

完整源代码可在 GitHub 查看：
[https://github.com/jamesfebin/ImpatientProgrammerBevyRust/tree/main/chapter11](https://github.com/jamesfebin/ImpatientProgrammerBevyRust/tree/main/chapter11)
