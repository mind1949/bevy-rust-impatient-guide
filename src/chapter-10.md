# 第十章：要有存档


![第10章演示](./assets/book_assets/chapter10-cover.png)

---

到目前为止，你已经在你的世界里战斗、收集物品、与敌人周旋。但如果玩家关闭游戏，一切都会消失。每次重新开始都得从头来过，这可不怎么有趣。

在这一章中，我们将为游戏赋予**记忆**——也就是存档/读档系统。玩家将能够保存他们的进度，并在之后随时回到游戏，从上次离开的地方继续冒险。

你将学到：

- Rust 中的序列化（Serialization）与 `bincode`
- 如何设计存档数据结构
- 多存档位系统
- 将游戏状态写入磁盘和从磁盘恢复
- 存档/读档 UI 与暂停菜单的集成
- 使用校验和（checksum）检测损坏的存档

---

## 1. 为什么存档这么麻烦？

你可能觉得"不就是把数据写到文件里吗"——没错，从本质上说确实如此。但在游戏开发中，存档之所以棘手，是因为：

1. **你需要保存的东西太多了**：玩家位置、血量、物品栏、敌人状态、地图数据……每一项都不能落下。
2. **数据完整性**：如果存档文件在写入过程中被损坏，玩家可能会丢失几十小时的进度。
3. **版本兼容**：游戏更新后，旧存档的格式可能不再兼容，你得处理好这个问题。

Rust 的类型系统和序列化生态让这些事情变得可控得多。让我们从依赖开始。

---

## 2. 添加新依赖

打开 `Cargo.toml`，我们在现有依赖的基础上添加两个新库：

```toml
[dependencies]
# ... 已有依赖 ...
bincode = "1.3"
chrono = { version = "0.4", features = ["serde"] }
```

**什么是 `bincode`？**

`bincode` 是一个 Rust 序列化库，它能将 Rust 结构体直接编码为紧凑的二进制格式。相比 JSON 或 TOML，二进制格式更小、读写更快，而且不需要编写任何解析代码——你只需要在结构体上标注 `#[derive(Serialize, Deserialize)]`，`bincode` 就会自动处理剩下的事情。

**什么是 `chrono`？**

`chrono` 是 Rust 的日期时间库。我们将用它来为每个存档生成人类可读的时间戳（例如 "05 May 2026, 03:30 PM"），这样玩家在加载界面就能看到每个存档是什么时候创建的。

**什么是 `serde` 特性？**

`chrono` 的 `serde` 特性让 `chrono` 的类型（如 `DateTime`）也能被自动序列化和反序列化。如果你的存档中包含时间戳字段，这个特性是必需的。

---

## 3. 存档模块的结构

创建一个新的 `save` 模块，放置在 `src/save/` 目录下。这个模块包含三个子模块：

```
src/save/
├── mod.rs      # 插件注册、资源定义
├── data.rs     # 数据结构定义、文件路径工具
├── systems.rs  # 存档/读档的核心逻辑
└── ui.rs       # 存档/读档的 UI 界面
```

---

## 4. 数据结构：我们要保存什么？

打开 `src/save/data.rs`，这是整个系统的基石——我们需要精确地定义游戏世界中有哪些数据需要被持久化。

```rust
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

use crate::characters::facing::Facing;
use crate::collision::TileType;
use crate::combat::PowerType;
use crate::inventory::ItemKind;

pub const SAVE_VERSION: u32 = 1;
pub const MAX_SLOTS: usize = 5;
```

**什么是 `SAVE_VERSION`？**

一个简单的整数常量，代表当前存档格式的版本号。当你以后修改了游戏逻辑，导致存档数据结构发生变化时，就可以递增这个版本号。在加载时我们会检查版本号，如果发现不匹配（比如玩家试图加载一个来自旧版本游戏的存档），我们可以优雅地告知玩家"存档版本不兼容"，而不是让游戏崩溃。

**什么是 `MAX_SLOTS`？**

存档位的数量——我们允许玩家在 5 个不同的存档位之间选择，这样他们可以同时保留多个游戏进度。

接下来是存档文件的外层结构：

```rust
#[derive(Serialize, Deserialize)]
pub struct SaveFile {
    pub checksum: u64,
    pub data: Vec<u8>,
}
```

**什么是 `SaveFile`？**

这是一个"信封"结构。真正的游戏数据（`SaveData`）会先被序列化为二进制字节（`data: Vec<u8>`），然后我们根据这些字节计算出一个校验和（`checksum`），最后把这两者放在一起再序列化一次，写入磁盘。

在加载时，我们读取 `SaveFile`，用 `checksum` 验证 `data` 没有被篡改或损坏，然后才反序列化出真正的 `SaveData`。

**什么是校验和（checksum）？**

校验和是一种简短的"数字指纹"。你用同样的数据计算两次，得到的结果一定是相同的。如果数据发生了任何改变（哪怕只是一个比特），校验和也会变得完全不同。这样我们就能检测出"文件写到一半断电了"或者"有人手动修改了存档文件"的情况。

接下来是真正的游戏数据：

```rust
#[derive(Serialize, Deserialize)]
pub struct SaveData {
    pub version: u32,
    pub timestamp: String,
    pub slot_name: String,
    pub player: PlayerSave,
    pub enemies: Vec<EnemySave>,
    pub inventory: HashMap<ItemKind, u32>,
    pub tiles: Vec<TileSave>,
}
```

每个字段都有明确的职责：

| 字段 | 作用 |
|------|------|
| `version` | 存档格式版本，用于兼容性检查 |
| `timestamp` | 人类可读的保存时间（如 "05 May 2026, 03:30 PM"） |
| `slot_name` | 存档位名称（如 "Slot 1"） |
| `player` | 玩家的完整状态 |
| `enemies` | 所有敌人的状态列表 |
| `inventory` | 物品栏：每种物品及其数量 |
| `tiles` | 所有地图瓦片的状态 |

现在定义玩家数据：

```rust
#[derive(Serialize, Deserialize)]
pub struct PlayerSave {
    pub position: [f32; 3],
    pub health_current: f32,
    pub health_max: f32,
    pub power_type: PowerType,
    pub character_name: String,
    pub character_index: usize,
    pub facing: Facing,
}
```

**为什么使用 `[f32; 3]` 而不是 `Vec3`？**

注意我们用的是普通数组 `[f32; 3]` 而不是 Bevy 的 `Vec3`。这是因为 `Vec3` 来自 Bevy，而 Bevy 的类型默认没有实现 serde 的 `Serialize` 和 `Deserialize` trait。当然，你可以手动为 `Vec3` 实现这些 trait，但使用数组是最简单直接的方式——反序列化后我们只需要 `Vec3::new(pos[0], pos[1], pos[2])` 就能恢复。

敌人数据与玩家类似，但更精简：

```rust
#[derive(Serialize, Deserialize)]
pub struct EnemySave {
    pub position: [f32; 3],
    pub health_current: f32,
    pub health_max: f32,
    pub character_name: String,
    pub power_type: PowerType,
    pub facing: Facing,
}
```

地图瓦片的数据稍微复杂一些，因为涉及到纹理图集（atlas）和旋转：

```rust
#[derive(Serialize, Deserialize)]
pub struct TileSave {
    pub position: [f32; 3],
    pub rotation: [f32; 4],  // Quat (x, y, z, w)
    pub scale: [f32; 3],
    pub atlas_index: usize,
    pub tile_type: TileType,
    pub pickable: Option<ItemKind>,
}
```

**为什么 `rotation` 是 `[f32; 4]`？**

`Quat`（四元数）有四个分量：x、y、z、w。和 `Vec3` 一样，`Quat` 也没有默认的 serde 支持，所以我们用数组存储，加载时再通过 `Quat::from_xyzw(x, y, z, w)` 恢复。

**为什么 `pickable` 是 `Option<ItemKind>`？**

有些瓦片（比如树或者墙壁）上面可能有可以拾取的物品。我们在保存时记录这一点，加载时就能正确地在瓦片上恢复可拾取物品。

接下来是存档元数据——用于在 UI 中快速显示，而无需加载整个存档文件：

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct SaveMetadata {
    pub timestamp: String,
    pub character_name: String,
    pub player_health: f32,
    pub player_max_health: f32,
}
```

最后是一些工具函数：

```rust
pub fn saves_directory() -> std::path::PathBuf {
    let mut path = std::env::current_exe()
        .unwrap_or_default()
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .to_path_buf();
    path.push("saves");
    path
}

pub fn save_file_path(slot: usize) -> std::path::PathBuf {
    saves_directory().join(format!("slot_{}.sav", slot))
}

pub fn meta_file_path(slot: usize) -> std::path::PathBuf {
    saves_directory().join(format!("slot_{}.meta", slot))
}
```

这些函数决定了存档文件保存在哪里。它们的逻辑是：**存档存放在可执行文件所在目录下的 `saves/` 文件夹中**。每个存档位有两个文件：

- `slot_0.sav` — 完整的游戏存档数据（包含校验和）
- `slot_0.meta` — 快速读取用的元数据（只包含时间戳、角色名、血量）

**为什么把元数据分开存？**

想象一下：玩家打开读档界面，我们需要列出 5 个存档位的信息（时间、角色、血量）。如果每次都要加载完整的存档文件（可能很大），UI 就会变慢。元数据文件非常小，读取速度快，适合频繁访问。

校验和函数——一个简单的 FNV-1a 哈希实现：

```rust
pub fn compute_checksum(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}
```

**什么是 FNV-1a？**

FNV-1a 是一种非常快速的非加密哈希算法。它不需要密码学级别的安全性，但对于"检测数据是否被意外修改"这个目的来说已经足够好，而且计算开销极低。我们在保存时计算一次校验和，加载时再计算一次并比较——如果两者不一致，说明数据已被损坏。

---

## 5. 存档/读档的核心逻辑

`src/save/systems.rs` 包含了加载存档数据的核心函数：

```rust
use std::fs;

use super::data::*;

pub fn load_save_data(slot: usize) -> Result<SaveData, String> {
    let path = save_file_path(slot);
    let file_bytes = fs::read(&path).map_err(|e| format!("Read error: {}", e))?;

    let save_file: SaveFile =
        bincode::deserialize(&file_bytes).map_err(|e| format!("Deserialize error: {}", e))?;

    // 验证校验和
    let computed = compute_checksum(&save_file.data);
    if computed != save_file.checksum {
        return Err("Save file corrupted or tampered with".into());
    }

    let save_data: SaveData = bincode::deserialize(&save_file.data)
        .map_err(|e| format!("Data deserialize error: {}", e))?;

    if save_data.version != SAVE_VERSION {
        return Err(format!(
            "Incompatible save version: {} (expected {})",
            save_data.version, SAVE_VERSION
        ));
    }

    Ok(save_data)
}
```

加载流程包含**四层保护**：

1. **文件读取**：如果文件不存在或无法读取，返回错误。
2. **外层反序列化**：从磁盘字节解包出 `SaveFile` 结构。
3. **校验和验证**：确保数据未被损坏。
4. **内层反序列化 + 版本检查**：解包出 `SaveData` 并确认格式兼容。

每一步都可能失败，但我们用 `Result` 类型优雅地处理了所有错误情况。

```rust
pub fn load_slot_metadata(slot: usize) -> Option<SaveMetadata> {
    let path = meta_file_path(slot);
    let bytes = fs::read(&path).ok()?;
    bincode::deserialize(&bytes).ok()
}
```

这个函数用于快速读取元数据文件。如果文件不存在（空存档位），返回 `None`。注意我们使用了 `ok()?`——如果读取或反序列化失败，就默默地返回 `None`，而不是在 UI 中弹出错误信息。

---

## 6. UI 状态与资源

在查看 UI 代码之前，我们需要先理解两个关键资源。打开 `src/save/ui.rs`：

```rust
use bevy::prelude::*;
// ... 其他导入 ...

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveLoadMode {
    Save,
    Load,
}
```

`SaveLoadMode` 枚举区分两种模式：保存还是加载。UI 在不同的模式下有不同的行为——例如在加载模式下，空的存档位应该被禁用。

```rust
#[derive(Resource, Default)]
pub struct PendingSaveLoadAction(pub Option<(SaveLoadMode, usize)>);
```

`PendingSaveLoadAction` 是一个"待办事项"资源。当玩家点击了一个存档位按钮后，我们不会立即执行存档/读档操作（因为那需要访问世界状态，而 UI 系统中有各种查询限制），而是将这个操作存储在这个资源中。在下一帧，专门的系统会读取这个资源并执行实际操作。

**为什么不用事件（Event）而用 Resource？**

对于读档操作，我们需要对整个 `World` 进行大规模修改（清理旧实体、生成新实体），这超出了普通 System 参数所能安全访问的范围。我们会用到 `World` 的独占引用（exclusive reference），而 Resource 是最方便的传递方式。

```rust
#[derive(Resource)]
pub struct SaveLoadUIState {
    pub active: bool,
    pub mode: SaveLoadMode,
}

impl Default for SaveLoadUIState {
    fn default() -> Self {
        Self {
            active: false,
            mode: SaveLoadMode::Save,
        }
    }
}
```

`SaveLoadUIState` 控制存档/读档 UI 的显示状态。`active` 表示 UI 是否打开，`mode` 表示当前是保存模式还是加载模式。

最后是几个标记组件，用于在查询中标识 UI 实体：

```rust
#[derive(Component)]
pub struct SaveLoadUI;

#[derive(Component)]
pub struct SlotButton(pub usize);

#[derive(Component)]
pub struct BackButton;
```

---

## 7. 构建存档/读档 UI

### 主 UI 渲染

```rust
pub fn handle_save_load_ui(
    mut commands: Commands,
    ui_state: Res<SaveLoadUIState>,
    existing_ui: Query<Entity, With<SaveLoadUI>>,
) {
    if !ui_state.is_changed() {
        return;
    }

    for entity in existing_ui.iter() {
        commands.entity(entity).despawn();
    }

    if !ui_state.active {
        return;
    }

    let title = match ui_state.mode {
        SaveLoadMode::Save => "SAVE GAME",
        SaveLoadMode::Load => "LOAD GAME",
    };

    // 收集所有存档位的元数据
    let mut slot_infos: Vec<Option<SaveMetadata>> = Vec::new();
    for slot in 0..MAX_SLOTS {
        slot_infos.push(systems::load_slot_metadata(slot));
    }

    // 构建 UI 层级
    commands
        .spawn((
            SaveLoadUI,
            Node { /* ... 全屏半透明背景 ... */ },
            BackgroundColor(Color::srgba(0.05, 0.05, 0.1, 1.0)),
            GlobalZIndex(100),
        ))
        .with_children(|parent| {
            // 标题
            parent.spawn((Text::new(title), /* ... */));

            // 5 个存档位按钮
            for slot in 0..MAX_SLOTS {
                let info = &slot_infos[slot];
                let label = match info {
                    Some(meta) => format!("Slot {} — {}", slot + 1, meta.timestamp),
                    None => format!("Slot {} — Empty", slot + 1),
                };

                // 在加载模式下，空存档位被禁用
                let is_empty = info.is_none();
                let is_load_mode = ui_state.mode == SaveLoadMode::Load;
                let disabled = is_load_mode && is_empty;
                // ...
            }

            // 返回按钮
            parent.spawn((BackButton, Button { /* ... */ }));
        });
}
```

这个系统监听 `SaveLoadUIState` 的变化。当 `active` 变为 `true` 时，它会先清理掉之前的 UI（如果有的话），然后重新创建完整的存档/读档界面。

**为什么每次都要先清理再重建？**

因为存档位的元数据（时间戳等）可能在每次打开时都不同。与其尝试局部更新，不如简单地销毁旧的 UI 并创建新的——UI 不是性能热点，这种"全量刷新"的做法更简单、更不容易出错。

### 存档位按钮处理

```rust
pub fn handle_slot_buttons(
    mut ui_state: ResMut<SaveLoadUIState>,
    mut pending: ResMut<PendingSaveLoadAction>,
    interaction_query: Query<(&Interaction, &SlotButton), Changed<Interaction>>,
) {
    for (interaction, slot_btn) in interaction_query.iter() {
        if *interaction != Interaction::Pressed {
            continue;
        }
        // 记录待办操作
        pending.0 = Some((ui_state.mode, slot_btn.0));
        // 关闭 UI
        ui_state.active = false;
    }
}
```

当玩家点击一个存档位按钮时，我们在 `PendingSaveLoadAction` 中记录下来："用户想在槽位 X 执行保存/加载操作"，然后立即关闭 UI。实际的保存或加载操作由其他专用系统处理。

### 返回按钮

```rust
pub fn handle_back_button(
    mut ui_state: ResMut<SaveLoadUIState>,
    interaction_query: Query<&Interaction, (Changed<Interaction>, With<BackButton>)>,
    input: Res<ButtonInput<KeyCode>>,
) {
    if input.just_pressed(KeyCode::Escape) {
        ui_state.active = false;
        return;
    }
    for interaction in interaction_query.iter() {
        if *interaction == Interaction::Pressed {
            ui_state.active = false;
        }
    }
}
```

玩家可以通过点击"Back"按钮或按 Escape 键来关闭存档/读档界面。

---

## 8. 执行保存

真正的保存逻辑，同样在 `ui.rs` 中：

```rust
pub fn execute_save(
    mut pending: ResMut<PendingSaveLoadAction>,
    tile_query: Query<(&Transform, &Sprite, &TileMarker, Option<&Pickable>)>,
    player_query: Query<
        (&Transform, &Health, &PlayerCombat, &CharacterEntry, &Facing),
        With<Player>,
    >,
    enemy_query: Query<(&Transform, &Health, &CharacterEntry, &Facing), With<Enemy>>,
    inventory: Res<Inventory>,
    character_index: Res<CurrentCharacterIndex>,
) {
    let Some((SaveLoadMode::Save, slot)) = pending.0 else {
        return;
    };
    pending.0 = None; // 消费掉这个待办操作

    // 收集玩家数据
    let Ok((player_tf, player_health, player_combat, player_entry, player_facing)) =
        player_query.single()
    else {
        error!("No player found for save");
        return;
    };

    let player_save = PlayerSave {
        position: [
            player_tf.translation.x,
            player_tf.translation.y,
            player_tf.translation.z,
        ],
        health_current: player_health.current,
        health_max: player_health.max,
        power_type: player_combat.power_type,
        character_name: player_entry.name.clone(),
        character_index: character_index.index,
        facing: *player_facing,
    };

    // 收集所有敌人数据
    let mut enemies = Vec::new();
    for (tf, health, entry, facing) in enemy_query.iter() {
        enemies.push(EnemySave {
            position: [tf.translation.x, tf.translation.y, tf.translation.z],
            health_current: health.current,
            health_max: health.max,
            character_name: entry.name.clone(),
            power_type: crate::combat::PowerType::Fire,
            facing: *facing,
        });
    }

    // 收集所有瓦片数据
    let mut tiles = Vec::new();
    for (tf, sprite, tile_marker, pickable) in tile_query.iter() {
        tiles.push(TileSave {
            position: [tf.translation.x, tf.translation.y, tf.translation.z],
            rotation: [rot.x, rot.y, rot.z, rot.w],
            scale: [tf.scale.x, tf.scale.y, tf.scale.z],
            atlas_index: /* ... */,
            tile_type: tile_marker.tile_type,
            pickable: pickable.map(|p| p.kind),
        });
    }

    // 生成时间戳
    let timestamp = chrono::Local::now()
        .format("%d %b %Y, %I:%M %p")
        .to_string();

    let save_data = SaveData {
        version: SAVE_VERSION,
        timestamp: timestamp.clone(),
        slot_name: format!("Slot {}", slot + 1),
        player: player_save,
        enemies,
        inventory: inventory.items().clone(),
        tiles,
    };

    match do_write_save(slot, &save_data, &timestamp) {
        Ok(()) => info!("Saved to slot {}", slot + 1),
        Err(e) => error!("Failed to save: {}", e),
    }
}
```

**什么是 `chrono::Local::now().format(...)`？**

这是 `chrono` 库的 `format` 方法，它将当前时间格式化为类似于 `"05 May 2026, 03:30 PM"` 的人类可读字符串。`%d` 是日期，`%b` 是月份缩写，`%Y` 是年份，`%I:%M %p` 是 12 小时制时间。

实际的写入函数：

```rust
fn do_write_save(slot: usize, save_data: &SaveData, timestamp: &str) -> Result<(), String> {
    // 第一步：序列化游戏数据
    let data_bytes =
        bincode::serialize(save_data).map_err(|e| format!("Serialize error: {}", e))?;
    // 第二步：计算校验和
    let checksum = compute_checksum(&data_bytes);
    // 第三步：打包成 SaveFile
    let save_file = SaveFile {
        checksum,
        data: data_bytes,
    };
    // 第四步：序列化 SaveFile 并写入磁盘
    let file_bytes =
        bincode::serialize(&save_file).map_err(|e| format!("Serialize error: {}", e))?;

    let dir = saves_directory();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Create dir error: {}", e))?;
    std::fs::write(save_file_path(slot), &file_bytes)
        .map_err(|e| format!("Write error: {}", e))?;

    // 第五步：写入元数据文件
    let metadata = SaveMetadata {
        timestamp: timestamp.to_string(),
        character_name: save_data.player.character_name.clone(),
        player_health: save_data.player.health_current,
        player_max_health: save_data.player.health_max,
    };
    let meta_bytes =
        bincode::serialize(&metadata).map_err(|e| format!("Meta serialize error: {}", e))?;
    std::fs::write(meta_file_path(slot), &meta_bytes)
        .map_err(|e| format!("Meta write error: {}", e))?;

    Ok(())
}
```

保存流程分为五个清晰的步骤：

1. **序列化** `SaveData` → 二进制字节
2. **计算校验和** 覆盖这些字节
3. **打包** 为 `SaveFile{checksum, data}`
4. **写入** `.sav` 文件
5. **写入** `.meta` 元数据文件

---

## 9. 执行读取

读取（加载存档）是这个过程最复杂的部分，因为它需要对 `World` 进行独占访问——我们需要清空整个游戏世界，然后根据存档数据重建一切。

```rust
pub fn execute_load(world: &mut World) {
    // 第一步：获取待办操作中的槽位
    let slot = {
        let pending = world.resource::<PendingSaveLoadAction>();
        match pending.0 {
            Some((SaveLoadMode::Load, slot)) => slot,
            _ => return,
        }
    };
    world.resource_mut::<PendingSaveLoadAction>().0 = None;

    // 第二步：加载并验证存档数据
    let save_data = match systems::load_save_data(slot) {
        Ok(data) => data,
        Err(e) => {
            error!("Failed to load: {}", e);
            return;
        }
    };

    // 第三步：清空所有游戏实体
    let mut to_despawn = Vec::new();
    for entity in world.query_filtered::<Entity, With<TileMarker>>().iter(world) {
        to_despawn.push(entity);
    }
    for entity in world.query_filtered::<Entity, With<Player>>().iter(world) {
        to_despawn.push(entity);
    }
    for entity in world.query_filtered::<Entity, With<Enemy>>().iter(world) {
        to_despawn.push(entity);
    }
    // ... 还有 Projectile, ParticleEmitter, Particle, HealthBarOwner, PauseMenu, SaveLoadUI ...
    for entity in to_despawn {
        world.despawn(entity);
    }

    // 第四步：根据存档数据重建世界
    // ... 生成瓦片、玩家、敌人 ...
    // 第五步：恢复资源状态
    world.resource_mut::<Inventory>().set_items(save_data.inventory);
    world.resource_mut::<PlayerSpawned>().0 = true;
    world.resource_mut::<EnemiesSpawned>().0 = true;
    // ...

    // 第六步：切换到游戏状态
    world.resource_mut::<NextState<GameState>>().set(GameState::Playing);
}
```

**为什么 `execute_load` 的参数是 `&mut World` 而不是普通的 System 参数？**

这是一个需要独占访问（exclusive access）的系统。我们要：

1. 查询具有各种组件的实体
2. 逐个销毁它们
3. 生成全新的实体
4. 修改多个资源

这种"清空整个世界"的操作无法通过标准 System 参数安全地表达，因为标准 System 参数是并行的。`&mut World` 让我们可以完全控制整个 ECS 世界。

**`world.query_filtered::<Entity, With<TileMarker>>()` 是什么？**

这是在 `World` 上直接运行查询，而不是通过 System 参数。它以借用检查器安全的方式迭代所有带有 `TileMarker` 组件的实体，然后我们收集它们的 Entity ID，稍后统一销毁。

### 重建玩家

```rust
// 生成玩家实体
let player_data = &save_data.player;
let char_idx = player_data.character_index
    .min(characters_list.characters.len() - 1);
let character_entry = characters_list.characters[char_idx].clone();

// 创建纹理图集
let layout = {
    let mut layouts = world.resource_mut::<Assets<TextureAtlasLayout>>();
    layouts.add(TextureAtlasLayout::from_grid(
        UVec2::splat(character_entry.tile_size),
        character_entry.atlas_columns as u32,
        (max_row + 1) as u32,
        None, None,
    ))
};
let texture = {
    let asset_server = world.resource::<AssetServer>();
    asset_server.load(&character_entry.texture_path)
};
let sprite = Sprite::from_atlas_image(texture, TextureAtlas { layout, index: 0 });

world.spawn((
    Player,
    Transform::from_translation(Vec3::new(
        player_data.position[0],
        player_data.position[1],
        player_data.position[2],
    )).with_scale(Vec3::splat(PLAYER_SCALE)),
    sprite,
    AnimationController::default(),
    CharacterState::default(),
    Velocity::default(),
    player_data.facing,
    Collider::default(),
    PlayerCombat::new(player_data.power_type),
    Health { current: player_data.health_current, max: player_data.health_max },
    AnimationTimer(Timer::from_seconds(
        DEFAULT_ANIMATION_FRAME_TIME, TimerMode::Repeating,
    )),
    character_entry,
));
```

重建玩家的过程实际上和首次生成玩家非常相似——我们从存档中读取位置、血量、朝向等数据，然后创建一个具有所有这些组件的实体。关键是，我们通过 `TextureAtlasLayout` 动态创建纹理图集，这样就不需要预先知道角色使用哪个精灵表。

### 重建敌人

```rust
for enemy_data in &save_data.enemies {
    let enemy_entry = characters_list
        .characters
        .iter()
        .find(|c| c.name == enemy_data.character_name);

    let Some(enemy_entry) = enemy_entry else {
        warn!("Unknown enemy character: {}", enemy_data.character_name);
        continue;
    };

    // ... 创建纹理图集、生成实体 ...
    world.spawn((
        Enemy,
        sprite,
        Transform::from_translation(Vec3::new(
            enemy_data.position[0],
            enemy_data.position[1],
            enemy_data.position[2],
        )).with_scale(Vec3::splat(ENEMY_SCALE)),
        // ... 所有必需的组件 ...
        EnemyCombat::default(),
        Health { current: enemy_data.health_current, max: enemy_data.health_max },
        AIBehavior::default(),
        EnemyPath::default(),
        // ...
    ));
}
```

**这段代码特别值得注意的是**：我们通过 `characters_list.characters.iter().find(|c| c.name == ...)` 来按名称查找敌人的角色配置。这意味着即使敌人在存档中被保存为名称字符串，我们也能动态地找到对应的角色配置——这比保存角色 ID 更健壮，因为角色列表的排列顺序可能在游戏更新中发生变化。

---

## 10. 注册 SavePlugin

`src/save/mod.rs` 负责将所有系统注册到 Bevy 的 App 中：

```rust
use bevy::prelude::*;
use crate::state::GameState;

pub use ui::{SaveLoadUIState, SaveLoadMode};

pub struct SavePlugin;

impl Plugin for SavePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<SaveLoadUIState>()
            .init_resource::<ui::PendingSaveLoadAction>()
            // UI 渲染：在暂停或主菜单状态下运行
            .add_systems(
                Update,
                ui::handle_save_load_ui
                    .run_if(in_state(GameState::Paused)
                        .or(in_state(GameState::MainMenu))),
            )
            // 存档位按钮处理
            .add_systems(
                Update,
                ui::handle_slot_buttons
                    .run_if(|ui_state: Res<SaveLoadUIState>| ui_state.active)
                    .run_if(in_state(GameState::Paused)
                        .or(in_state(GameState::MainMenu))),
            )
            // 返回按钮处理
            .add_systems(
                Update,
                ui::handle_back_button
                    .run_if(|ui_state: Res<SaveLoadUIState>| ui_state.active)
                    .run_if(in_state(GameState::Paused)
                        .or(in_state(GameState::MainMenu))),
            )
            // 执行存档（仅 Save 模式）
            .add_systems(
                Update,
                ui::execute_save
                    .run_if(|p: Res<ui::PendingSaveLoadAction>|
                        matches!(p.0, Some((SaveLoadMode::Save, _)))),
            )
            // 执行读档（仅 Load 模式，独占 World 访问）
            .add_systems(
                Update,
                ui::execute_load
                    .run_if(|p: Res<ui::PendingSaveLoadAction>|
                        matches!(p.0, Some((SaveLoadMode::Load, _)))),
            );
    }
}
```

注意系统的运行条件（`.run_if`）设计得非常精细：

- UI 渲染只会在暂停或主菜单状态下触发
- 按钮处理要求 UI 处于激活状态
- 执行保存/加载只会在 `PendingSaveLoadAction` 被设置后触发

这种设计确保了各个系统不会在错误的时间、错误的状态下运行。

---

## 11. 集成到主菜单和暂停菜单

### 暂停菜单的修改

现在我们需要在暂停菜单中添加"Save Game"和"Load Game"按钮。回顾 `src/state/pause.rs`：

```rust
#[derive(Component)]
pub enum PauseButton {
    Resume,
    SaveGame,
    LoadGame,
    MainMenu,
    Quit,
}

pub fn spawn_pause_menu(mut commands: Commands) {
    // ...
    let buttons = [
        (PauseButton::Resume, "Resume"),
        (PauseButton::SaveGame, "Save Game"),
        (PauseButton::LoadGame, "Load Game"),
        (PauseButton::MainMenu, "Main Menu"),
        (PauseButton::Quit, "Quit"),
    ];
    // ...
}
```

按钮处理逻辑：

```rust
pub fn handle_pause_buttons(
    mut next_state: ResMut<NextState<GameState>>,
    mut ui_state: ResMut<SaveLoadUIState>,
    interaction_query: Query<(&Interaction, &PauseButton), Changed<Interaction>>,
    mut exit: MessageWriter<AppExit>,
) {
    if ui_state.active {
        return; // 如果存档 UI 已打开，不处理暂停菜单按钮
    }

    for (interaction, button) in interaction_query.iter() {
        if *interaction != Interaction::Pressed {
            continue;
        }

        match button {
            PauseButton::Resume => next_state.set(GameState::Playing),
            PauseButton::SaveGame => {
                ui_state.active = true;
                ui_state.mode = SaveLoadMode::Save;
            }
            PauseButton::LoadGame => {
                ui_state.active = true;
                ui_state.mode = SaveLoadMode::Load;
            }
            PauseButton::MainMenu => next_state.set(GameState::MainMenu),
            PauseButton::Quit => exit.write(AppExit::Success),
        }
    }
}
```

**注意这行代码**：`if ui_state.active { return; }`。这防止了当存档 UI 覆盖在暂停菜单上时，按钮点击穿透到下面的暂停菜单。

### 主菜单的修改

主菜单也获得了加载游戏的能力：

```rust
#[derive(Component)]
pub enum MainMenuButton {
    NewGame,
    LoadGame,
    Quit,
}

pub fn handle_main_menu_buttons(
    mut next_state: ResMut<NextState<GameState>>,
    mut ui_state: ResMut<SaveLoadUIState>,
    interaction_query: Query<(&Interaction, &MainMenuButton), Changed<Interaction>>,
    mut exit: MessageWriter<AppExit>,
) {
    for (interaction, button) in interaction_query.iter() {
        if *interaction != Interaction::Pressed { continue; }

        match button {
            MainMenuButton::NewGame => next_state.set(GameState::Loading),
            MainMenuButton::LoadGame => {
                ui_state.active = true;
                ui_state.mode = SaveLoadMode::Load;
            }
            MainMenuButton::Quit => exit.write(AppExit::Success),
        }
    }
}
```

## 12. 状态管理的配合

存档/读档 UI 与游戏状态管理紧密配合。在 `src/state/mod.rs` 中，我们需要确保：

1. **当玩家按下 Escape 时，如果存档 UI 已打开，不要重复触发暂停/恢复切换**：

```rust
fn toggle_pause(
    input: Res<ButtonInput<KeyCode>>,
    current_state: Res<State<GameState>>,
    mut next_state: ResMut<NextState<GameState>>,
    ui_state: Res<SaveLoadUIState>,
) {
    if input.just_pressed(KeyCode::Escape) {
        if ui_state.active {
            return; // 存档 UI 已打开，不处理 Escape
        }
        match current_state.get() {
            GameState::Playing => next_state.set(GameState::Paused),
            GameState::Paused => next_state.set(GameState::Playing),
            _ => {}
        }
    }
}
```

2. **当离开暂停状态时，关闭存档 UI**：

```rust
fn close_save_load_ui(mut ui_state: ResMut<SaveLoadUIState>) {
    ui_state.active = false;
}

// 注册：
.add_systems(OnExit(GameState::Paused),
    (pause::despawn_pause_menu, close_save_load_ui))
```

---

## 13. main.rs 的变化

在 `main.rs` 中，我们有一个关键的重构：**将地图生成拆分为两个阶段**。

```rust
fn main() {
    App::new()
        .add_plugins(DefaultPlugins /* ... */)
        .add_plugins(state::StatePlugin)
        .add_plugins(CameraPlugin)
        .add_plugins(inventory::InventoryPlugin)
        .add_plugins(collision::CollisionPlugin)
        .add_plugins(characters::CharactersPlugin)
        .add_plugins(combat::CombatPlugin)
        .add_plugins(enemy::EnemyPlugin)
        .add_plugins(particles::ParticlesPlugin)
        .add_plugins(save::SavePlugin)  // <-- 新增
        .add_systems(Startup, prepare_tilemap_handles_resource)
        .add_systems(OnEnter(GameState::Loading), setup_generator)
        .add_systems(Update, poll_map_generation
            .run_if(in_state(GameState::Loading)))
        .run();
}
```

**为什么需要拆分？**

关键原因是**读档**。当玩家加载存档时，我们不需要重新生成地图——瓦片数据已经在存档中了。但是，我们仍然需要 `TilemapHandles` 资源（它包含了瓦片精灵的纹理句柄），这些句柄是从精灵表加载的。

所以 `prepare_tilemap_handles_resource` 被提升到 `Startup`，这样它在游戏一开始就被初始化了。而真正的随机地图生成（`setup_generator`）仅在进入 `Loading` 状态时触发——无论你是新游戏还是读档，都会进入 `Loading` 状态，但读档时不需要重新生成地图。

**代码更新提示**：`setup_generator` 和 `poll_map_generation` 不再在 `Startup` 阶段运行，而是由 `GameState::Loading` 状态驱动。

---

## 14. "还记得吗？——探索反馈"（Explore Feedback）

当你在地图中点击某个位置时，角色会移动到该位置。如果你在移动过程中打开存档界面，游戏会暂停，角色会停在原地。当你保存并重新加载后，角色会精确地恢复到保存时的位置——包括正在播放的动画帧、面朝的方向、以及当前的血量和能量类型。

这种"精确恢复"是存档系统最基本也最重要的要求：**玩家必须感觉他们的进度被完美地保存了**。

---

## 15. 理解序列化（Serialization）与 bincode

现在让我们稍微深入一下 Rust 序列化的概念，因为它是整个存档系统的基础。

**什么是序列化？**

序列化是将内存中的数据结构转换为可以存储或传输的格式的过程。反序列化则是反向过程。

```
内存中的结构体  <--序列化/反序列化-->  二进制字节（或 JSON、XML 等）
```

**为什么选择 `bincode` 而不是 JSON？**

| 特性 | bincode | JSON |
|------|---------|------|
| 文件大小 | 极小（二进制） | 较大（文本） |
| 读写速度 | 极快 | 较慢 |
| 人类可读 | 否 | 是 |
| 安全性 | 需要校验和 | 天然可读但易篡改 |

对于游戏存档来说，速度和大小比人类可读性重要得多。玩家不需要打开存档文件来阅读内容——他们通过游戏内的 UI 来查看。

**serde 是如何工作的？**

`serde` 是 Rust 的事实标准序列化框架。它的工作方式非常优雅：

1. 你在结构体上标注 `#[derive(Serialize, Deserialize)]`
2. `serde` 在编译时生成代码，将你的结构体转换为一个中间表示
3. `bincode`（或其他格式库）读取这个中间表示，输出实际的字节

这意味着你只需要写一次注解，就能使用任意多的格式：

```rust
// 一个注解，多种格式
#[derive(Serialize, Deserialize)]
struct MyData { x: u32, y: u32 }

// 序列化为 bincode（二进制）
let bytes = bincode::serialize(&data)?;

// 序列化为 JSON（如果添加 serde_json 依赖）
let json = serde_json::to_string(&data)?;

// 序列化为 YAML（如果添加 serde_yaml 依赖）
let yaml = serde_yaml::to_string(&data)?;
```

---

## 16. 校验和（Checksum）的工作原理

我们实现的 `compute_checksum` 函数使用了 FNV-1a 哈希算法：

```rust
pub fn compute_checksum(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}
```

这个函数从固定的初始值（称为"偏移基础"）开始，然后对数据的每个字节执行两个操作：

1. **XOR**：将当前字节与哈希值异或
2. **乘法**：乘以一个特定的素数

**为什么使用 `wrapping_mul`？**

`wrapping_mul` 表示"环绕乘法"——当乘法结果超出 `u64` 的范围时，它会默默地截断（而不是 panic）。哈希算法依赖这种自然的溢出行为来产生分布良好的哈希值。

校验和的工作流程：

```
保存时：
SaveData → bincode → 字节 → compute_checksum → 校验和
                                        ↓
                    SaveFile { checksum, data: 字节 }

读取时：
SaveFile → 取出 data 和 checksum
               ↓
    重新计算 compute_checksum(data)
               ↓
    比较：新校验和 == 保存的校验和？
      ├── 是 → 数据完好，继续反序列化
      └── 否 → 数据损坏，拒绝加载
```

---

## 17. 测试你的存档系统

现在运行游戏，你应该能够：

1. **保存游戏**：按下 Escape 暂停 → 点击 "Save Game" → 选择存档位
2. **验证保存**：检查游戏目录下的 `saves/slot_0.sav` 和 `saves/slot_0.meta` 文件
3. **加载游戏**：在主菜单或暂停菜单中选择 "Load Game" → 选择有数据的存档位
4. **验证完整性**：手动修改 `.sav` 文件（比如改一个字节），然后在游戏中尝试加载——你应该看到错误提示而不是游戏崩溃

![存档 UI 效果](./assets/book_assets/chapter-10-save-ui.png)

---

## 18. 扩展思考

### 你能做但本章没有涵盖的改进

1. **自动保存**：在特定事件（进入新区域、击败 Boss）时自动保存到"自动存档"位
2. **云存档**：将存档文件同步到 Steam Cloud 或自定义服务器
3. **压缩**：使用 `flate2` 等库压缩存档数据，减小文件大小
4. **加密**：对存档文件进行简单加密，防止玩家修改
5. **更友好的 UI**：在存档位中显示更多信息，如游戏时间、所在区域、角色等级等

### 性能考虑

- 存档操作发生在游戏暂停时，所以不需要担心帧率影响
- `bincode` 序列化非常快——即使是复杂的世界状态，通常也能在几毫秒内完成
- 读档操作需要重建整个世界，可能会有一个短暂的加载画面

---

## 总结

干得不错！在这一章中，你为游戏添加了完整的存档/读档系统。回顾一下你学到的知识：

- **Rust 的序列化生态**：使用 `serde` + `bincode` 实现高效的数据持久化
- **数据结构设计**：如何规划存档需要保存的数据，包括玩家、敌人、物品、地图瓦片
- **数据完整性**：通过 FNV-1a 校验和检测文件损坏和篡改
- **存档位系统**：支持多个存档位，每个带独立的元数据文件
- **UI 集成**：在暂停菜单和主菜单中添加存档/读档入口
- **`&mut World` 独占访问**：当需要清空整个游戏世界并重建时使用
- **状态管理配合**：确保存档 UI 和游戏状态切换互不干扰

现在玩家可以放心地关闭游戏了——他们的冒险故事会被安全地保存下来，等待下一次启程。

在下一章中，我们将为游戏注入真正的声音——让世界不仅能看到，还能听到。
---

## 📂 查看本章源码

完整源代码可在 GitHub 查看：
[https://github.com/jamesfebin/ImpatientProgrammerBevyRust/tree/main/chapter10](https://github.com/jamesfebin/ImpatientProgrammerBevyRust/tree/main/chapter10)
