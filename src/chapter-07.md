# 第七章：让敌人出现


![第7章演示](./assets/book_assets/chapter7/ch7.gif)

> **耐心程序员的 Bevy 与 Rust 指南：第七章——让敌人出现**

*发布于 2026年2月2日*

---

**关于 AI 辅助**  
*是的，本章写作过程中使用了 AI 辅助。我负责结构设计、技术决策、方法论、代码组织方式，以及整理学习者可能遇到的问题列表。AI 帮助扩展了结构和解释内容，并由我全程编辑。每章我总共花费约 20-25 小时，包括编码和写作。如果任何部分感觉不对劲，请在 [Reddit](https://www.reddit.com/r/bevy/) 或 [Discord](https://discord.com/invite/cD9qEsSjUH) 上告诉我，我会进行改进。*

在本章结束时，你将拥有能够追踪并攻击玩家的敌人。

> **前置条件**：本章是 Bevy 教程系列的第七章。加入我们的[社区](https://discord.com/invite/cD9qEsSjUH)以获取新章节发布通知。开始之前，请先完成[第一章：让玩家出现](/posts/bevy-rust-game-development-chapter-1/)、[第二章：让世界出现](/posts/bevy-rust-game-development-chapter-2/)、[第三章：让数据流动](/posts/bevy-rust-game-development-chapter-3/)、[第四章：让碰撞出现](/posts/bevy-rust-game-development-chapter-4/)、[第五章：让拾取物出现](/posts/bevy-rust-game-development-chapter-5/)和[第六章：让粒子出现](/posts/bevy-rust-game-development-chapter-6/)，或者从[此仓库](https://github.com/jamesfebin/ImpatientProgrammerBevyRust)克隆第六章的代码进行学习。

> **开始之前：** *我一直在努力改进本教程，让您的学习之旅更加愉快。您的反馈至关重要——请在 [Reddit](https://www.reddit.com/r/bevy/)/[Discord](https://discord.com/invite/cD9qEsSjUH)/[LinkedIn](https://www.linkedin.com/in/febinjohnjames) 上分享您的困惑、问题或建议。喜欢本教程？请告诉我哪些地方对您有帮助！让我们一起让使用 Rust 和 Bevy 进行游戏开发变得更加易于上手。*

## 敌人与玩家有何不同？

你的玩家角色可以移动、播放动画、与物体碰撞并进行攻击。现在，你希望敌人也能做几乎相同的事情，除了决策部分。

玩家通过键盘输入进行决策。你按↑键，角色向上走。你按 Ctrl 键，他们攻击。输入系统读取你的按键，并设置像 `Velocity` 和 `CharacterState` 这样的组件。

敌人需要做出相同的决策，但必须自动完成。它们不是读取键盘，而是读取游戏世界。"玩家在哪里？我离得够近可以攻击了吗？我应该面向哪个方向？"

玩家和敌人都需要：

- 在世界中移动
- 根据状态播放动画
- 与墙壁和物体碰撞
- 使用魔法力量进行攻击

唯一的区别是**谁来决定做什么**。对于玩家，你来决定。对于敌人，AI 来决定。但一旦做出决定，剩下的过程是相同的。那么，我们能否复用为玩家编写的代码来处理敌人呢？让我们来一探究竟。

## 用组件的思维思考

在 Bevy 的 ECS 架构中，实体只是 ID。组件是数据。系统是逻辑。这种分离让我们能够构建可以在**任何**拥有正确组件的实体上工作的系统。

你的玩家实体拥有这些组件：

- `Player`（标记）
- `Transform`（位置）
- `Velocity`（移动）
- `CharacterState`（空闲、行走等）
- `Facing`（方向）
- `AnimationController`（精灵动画）
- `Collider`（物理）

一个敌人实体需要大部分相同的组件。关键洞察是：像 `apply_velocity`、`validate_movement` 和 `animate_characters` 这样的系统并不关心一个实体是玩家还是敌人。它们只处理组件。

![D2 图示](./assets/generated/d2/d2_9cc1d8cc84cdddff66849948227c9ef3.svg)

## 创建敌人模块

创建一个新文件夹 `src/enemy`，结构如下：

```
src/
├── enemy/
│   ├── mod.rs
│   ├── components.rs
│   ├── ai.rs
│   ├── combat.rs
│   └── spawn.rs
```

### 敌人组件

我们需要三个组件来定义敌人的行为。`Enemy` 标记用于标识哪些实体是敌人。`EnemyCombat` 组件赋予它们攻击能力。`AIBehavior` 组件控制它们的决策过程。

创建 `src/enemy/components.rs`：

```rust
// src/enemy/components.rs
use crate::combat::PowerType;
use bevy::prelude::*;

/// 敌人实体的标记组件
#[derive(Component)]
pub struct Enemy;

/// 敌人的战斗能力
#[derive(Component)]
pub struct EnemyCombat {
    pub power_type: PowerType,
    pub cooldown: Timer,
}

impl Default for EnemyCombat {
    fn default() -> Self {
        Self {
            power_type: PowerType::Shadow, // 墓地死神使用暗影魔法
            cooldown: Timer::from_seconds(2.0, TimerMode::Once), // 比玩家慢
        }
    }
}

impl EnemyCombat {
    pub fn new(power_type: PowerType, cooldown_seconds: f32) -> Self {
        Self {
            power_type,
            cooldown: Timer::from_seconds(cooldown_seconds, TimerMode::Once),
        }
    }
}

/// 敌人的 AI 行为状态
#[derive(Component)]
pub struct AIBehavior {
    pub attack_range: f32,
    pub detection_range: f32,
}

impl Default for AIBehavior {
    fn default() -> Self {
        Self {
            attack_range: 150.0,    // 在此范围内停止并攻击
            detection_range: 500.0, // 在此范围内开始跟随玩家
        }
    }
}

impl AIBehavior {
    pub fn new(attack_range: f32, detection_range: f32) -> Self {
        Self {
            attack_range,
            detection_range,
        }
    }
}
```

**这里发生了什么？**

`Enemy` 组件只是一个标记。它没有数据，只是将实体标记为敌人，以便系统可以查询它们。

`EnemyCombat` 存储敌人的攻击能力。`power_type` 决定它们发射哪种类型的投射物（我们的墓地死神使用暗影魔法）。`cooldown` 计时器防止它们每帧都攻击。

`AIBehavior` 定义了两个范围。`detection_range` 是敌人能"看到"玩家的距离。`attack_range` 是它们需要多近才会停止移动并开始攻击。

**为什么使用 Default？**

`Default` trait 允许我们快速生成敌人，而无需指定每个字段。我们可以调用 `EnemyCombat::default()` 来获得合理的起始值，然后在需要时使用 `EnemyCombat::new()` 自定义特定的敌人。

### 让敌人跟随你

现在到了有趣的部分。我们需要一个系统让敌人追踪并跟随玩家。

简单来说，直接让敌人向玩家移动？但如果中间有树呢？敌人会撞到障碍物并被卡住。

我们需要**寻路**（pathfinding），即找到绕过障碍物的路径的能力。行业标准的解决方案是 A\*（"A-star"）算法。

### 理解 A\* 寻路

A\* 是一种寻路算法，用于在网格上找到两点之间的最短路径。它广泛应用于游戏、机器人、GPS 导航等领域，因为它既高效又能保证找到最短路径。

A\* 通过为每个单元格计算分数来探索网格。单元格是网格中的一个方块（就像游戏世界中的一个瓦片）。这里的"代价"指的是移动到某处的开销。

- **g-代价**：从起点到当前单元格的实际距离
- **h-代价**：启发式——从当前单元格到目标的估计距离
- **f-代价**：总代价——g + h（走这条路的总估计代价）

该算法总是优先探索 f-代价最低的单元格。这使它既"贪婪"（总是选择看起来最好的）又明智（使用启发式来引导搜索）。

**绿色**单元格是敌人的起点，**红色**单元格是玩家的位置。**黑色障碍物**阻挡了道路，迫使算法绕行。

当 A\* 探索时，它会用**浅蓝色**标记待检查的候选单元格，用**粉色**标记已检查并排除的单元格。**深蓝色**单元格显示 A\* 当前正在检查的位置，一旦找到路径，它会亮起**黄色**。

注意算法如何不浪费时间去探索明显远离目标的单元格——它智能地优先考虑最有希望的方向！

### 添加寻路 crate

我们将使用 `pathfinding` crate 来实现 A\* 算法。

更新你的 `Cargo.toml`：

```toml
[dependencies]
bevy = "0.18"
bevy_procedural_tilemaps = "0.2.0"
bevy_common_assets = { version = "0.15.0-rc.1", features = ["ron"] }
serde = { version = "1.0", features = ["derive"] }
rand = "0.8"
pathfinding = "4.9"  # 添加这一行
```

现在我们有了寻路算法，需要构建使用它的**基础设施**。这包括三个部分：

1. **EnemyPath 组件**：存储计算出的路径，并跟踪敌人当前正在向哪个路径点移动
2. **CollisionMap 方法**：扩展我们的碰撞系统以支持寻路
3. **AI 系统**：使用上述两者让敌人智能地导航到玩家位置

让我们一步步构建每个部分。

**什么是路径点？**

路径点就像是沿着路径的面包屑。我们不存储"向北移动 3 个单位，然后向东移动 2 个单位"，而是存储实际的位置，如 `[(100, 50), (150, 50), (150, 100)]`。敌人向第一个路径点移动，当它足够接近（16 个单位）时，前进到下一个。这使得寻路非常灵活——路径点可以适应任何地形形状。

敌人（绿色）按顺序跟随每个路径点。当它距离当前路径点 16 像素以内时，就移动到下一个。最终它沿着路径到达玩家（红色）！

### EnemyPath 组件

现在让我们创建一个 `EnemyPath` 组件，它可以缓存路径点、跟踪沿路径的当前位置，并管理重新计算计时器。

更新 `src/enemy/components.rs`，在末尾添加以下内容：

```rust
// src/enemy/components.rs
// 在 AIBehavior 实现之后添加

/// 敌人导航的缓存路径
#[derive(Component, Default)]
pub struct EnemyPath {
    /// 世界坐标中的路径点
    pub waypoints: Vec<Vec2>,
    /// 当前路径点索引
    pub current_index: usize,
    /// 路径重新计算计时器
    pub recalc_timer: f32,
}

impl EnemyPath {
    /// 认为路径点已到达的距离阈值
    pub const WAYPOINT_THRESHOLD: f32 = 16.0;
    /// 重新计算路径的频率（秒）
    pub const RECALC_INTERVAL: f32 = 0.5;

    /// 获取当前路径点位置
    pub fn current_waypoint(&self) -> Option<Vec2> {
        self.waypoints.get(self.current_index).copied()
    }

    /// 前进到下一个路径点，如果路径完成则返回 true
    pub fn advance(&mut self) -> bool {
        self.current_index += 1;
        self.current_index >= self.waypoints.len()
    }

    /// 设置新路径（跳过第一个路径点，因为它是起始位置）
    pub fn set_path(&mut self, waypoints: Vec<Vec2>) {
        // 跳过路径点 0——它是敌人的当前位置
        // 这可以防止因短暂面朝后方而产生的抖动
        let new_waypoints = if waypoints.len() > 1 {
            waypoints[1..].to_vec()
        } else {
            waypoints
        };

        // 如果已有路径，检查新路径是否相似
        // 这可以防止在重新计算路径时出现闪烁
        if let Some(current_target) = self.current_waypoint() {
            if let Some(new_first) = new_waypoints.first() {
                // 如果新的第一个路径点距离当前目标很近，
                // 则保留当前路径——我们已经在正确的方向上
                if current_target.distance(*new_first) < Self::WAYPOINT_THRESHOLD * 1.5 {
                    return;
                }
            }
        }

        self.waypoints = new_waypoints;
        self.current_index = 0;
    }

    /// 检查是否拥有有效路径
    pub fn has_path(&self) -> bool {
        !self.waypoints.is_empty() && self.current_index < self.waypoints.len()
    }
}
```

**让我们逐一分析每个部分：**

- **`waypoints`**：将路径存储为世界坐标向量。一旦计算出路径，就将其缓存于此。
- **`current_index`**：跟踪当前正在向哪个路径点移动。当到达路径点 0 时，递增到路径点 1，依此类推。
- **`recalc_timer`**：从 0.5 秒开始倒计时。归零时，重新计算路径（以防玩家移动了）。
- **`current_waypoint()`**：返回当前正朝向的路径点（如果路径已完成则返回 None）。
- **`advance()`**：移动到下一个路径点，如果整个路径已完成则返回 true。
- **`set_path()`**：存储新路径，并带有智能优化：
  - 跳过路径点 0（敌人的当前位置）以避免抖动
  - 检查新路径是否与当前路径相似——如果是，则保留现有路径以减少闪烁
- **`has_path()`**：如果有有效且未完成的路径则返回 true。

**为什么要缓存路径？**

每帧都运行 A\* 会拖慢游戏。通过每 0.5 秒重新计算一次，我们以最小的性能代价获得流畅的移动。

**为什么要有路径点阈值？**

由于移动速度和帧时序，敌人可能永远无法精确落在路径点上。16 单位的阈值让我们可以在足够接近时认为已经"到达"。

---

现在我们能存储路径了，接下来需要**计算**路径。但谁来执行寻路？`CollisionMap`！

**为什么 CollisionMap 来做寻路？难道不应该由敌人自己计算路径吗？**

好问题！`CollisionMap` 已经知道哪些瓦片是可通行的、哪些不是——它拥有所有的地形数据。与其在敌人 AI 中重复这些知识，我们不如用寻路方法扩展 `CollisionMap`。这样：

- **敌人**只需问："给我一条到位置 X 的路径"
- **CollisionMap**回答："这是到达那里的路径点列表"

这保持了代码的整洁，并遵循了一个原则：*拥有数据的组件提供对该数据的操作*。

### 扩展 CollisionMap 以支持寻路

我们的碰撞地图知道可通行的瓦片，但它不知道如何*找到穿过它们的路径*。我们需要：

1. 获取有效的相邻单元格（确保对角线移动不会穿越墙壁的角落）
2. 如果目标被阻挡，找到最近的可通行瓦片
3. 运行 A\* 寻路以计算最优路径

**"不要穿越角落"是什么意思？**

想象两面墙在对角线处相遇。如果没有适当的检查，敌人可能会对角穿过那个缝隙，看起来就像穿墙一样！我们通过仅当两个相邻的基本方向单元格也都可通行时才允许对角线移动来防止这种情况。

```
  ┌───┬───┐
  │   │ W │  W = 墙
  ├───┼───┤
  │ W │   │  不能对角穿越！
  └───┴───┘
```

现在让我们为 `CollisionMap` 添加这三个协同工作的方法，以实现智能寻路。

打开 `src/collision/map.rs`，在 `impl CollisionMap` 块的末尾添加这些方法：

首先，在 `src/collision/map.rs` 顶部添加导入：

```rust
// src/collision/map.rs
use pathfinding::prelude::astar;
```

现在在 `impl CollisionMap` 块的末尾添加这些方法：

```rust
// src/collision/map.rs
// 在 impl CollisionMap 的末尾，结束大括号之前添加

    /// 获取可通行的相邻网格单元格（8 个方向）
    /// 仅当两个相邻的基本方向都畅通时才允许对角线移动
    pub fn get_neighbors(&self, pos: IVec2) -> Vec<IVec2> {
        let mut neighbors = Vec::new();

        // 基本方向（如果可通行则始终允许）
        let cardinals = [
            IVec2::new(0, 1), IVec2::new(0, -1), IVec2::new(-1, 0), IVec2::new(1, 0),
        ];

        for dir in cardinals {
            let neighbor = pos + dir;
            if self.is_walkable(neighbor.x, neighbor.y) {
                neighbors.push(neighbor);
            }
        }

        // 对角线方向——仅当两个相邻的基本方向都畅通时才允许
        // 这可以防止通过对角线墙壁"切角"
        let diagonals = [
            (IVec2::new(-1, 1), IVec2::new(-1, 0), IVec2::new(0, 1)),   // 左上
            (IVec2::new(1, 1), IVec2::new(1, 0), IVec2::new(0, 1)),     // 右上
            (IVec2::new(-1, -1), IVec2::new(-1, 0), IVec2::new(0, -1)), // 左下
            (IVec2::new(1, -1), IVec2::new(1, 0), IVec2::new(0, -1)),   // 右下
        ];

        for (diagonal, adj1, adj2) in diagonals {
            let diag_pos = pos + diagonal;
            let adj1_pos = pos + adj1;
            let adj2_pos = pos + adj2;

            // 仅当目标位置和两个相邻单元格都可通行时才允许对角线移动
            if self.is_walkable(diag_pos.x, diag_pos.y)
                && self.is_walkable(adj1_pos.x, adj1_pos.y)
                && self.is_walkable(adj2_pos.x, adj2_pos.y)
            {
                neighbors.push(diag_pos);
            }
        }

        neighbors
    }

    /// 使用 A* 算法查找路径
    pub fn find_path(&self, start: Vec2, goal: Vec2) -> Option<Vec<Vec2>> {
        use pathfinding::prelude::astar;

        let start_grid = self.world_to_grid(start);
        let goal_grid = self.world_to_grid(goal);

        if !self.is_walkable(start_grid.x, start_grid.y) {
            return None;
        }

        let actual_goal = if self.is_walkable(goal_grid.x, goal_grid.y) {
            goal_grid
        } else {
            self.find_nearest_walkable(goal_grid)?
        };

        let result = astar(
            &start_grid,
            |pos| {
                let pos = *pos;
                self.get_neighbors(pos).into_iter().map(move |n| {
                    let cost = if (n.x - pos.x).abs() + (n.y - pos.y).abs() == 2 {
                        14u32 // 对角线
                    } else {
                        10u32 // 基本方向
                    };
                    (n, cost)
                })
            },
            |pos| {
                let dx = (pos.x - actual_goal.x).abs();
                let dy = (pos.y - actual_goal.y).abs();
                ((dx + dy) * 10) as u32
            },
            |pos| *pos == actual_goal,
        );

        result.map(|(path, _cost)| {
            path.into_iter().map(|p| self.grid_to_world(p.x, p.y)).collect()
        })
    }

    /// 查找最近的可通行单元格
    pub fn find_nearest_walkable(&self, pos: IVec2) -> Option<IVec2> {
        for radius in 1i32..10 {
            for dx in -radius..=radius {
                for dy in -radius..=radius {
                    if dx.abs() == radius || dy.abs() == radius {
                        let check = IVec2::new(pos.x + dx, pos.y + dy);
                        if self.is_walkable(check.x, check.y) {
                            return Some(check);
                        }
                    }
                }
            }
        }
        None
    }

    /// 查找给定半径的圆形完全畅通的最近位置。
    /// 从给定世界位置开始搜索，最多向外扩展 20 个瓦片。
    /// 返回世界空间位置（瓦片中心），如果未找到则返回 None。
    pub fn find_nearest_clear_position(&self, world_pos: Vec2, radius: f32) -> Option<Vec2> {
        let grid_pos = self.world_to_grid(world_pos);

        for ring in 0i32..20 {
            for dx in -ring..=ring {
                for dy in -ring..=ring {
                    if ring > 0 && dx.abs() != ring && dy.abs() != ring {
                        continue; // 只检查环的周长
                    }
                    let candidate_grid = IVec2::new(grid_pos.x + dx, grid_pos.y + dy);
                    let candidate_world = self.grid_to_world(candidate_grid.x, candidate_grid.y);
                    if self.is_circle_clear(candidate_world, radius) {
                        return Some(candidate_world);
                    }
                }
            }
        }
        None
    }
```

**让我们逐段分析寻路代码：**

**1. 邻居检测（`get_neighbors`）：**

- 首先检查所有 4 个基本方向（上/下/左/右）
- 然后检查所有 4 个对角线方向，**仅当**两个相邻的基本方向都可通行
- 这可以防止敌人通过对角线墙壁"切角"

**2. 最近可通行搜索（`find_nearest_walkable`）：**

- 使用从目标开始的螺旋搜索模式
- 检查逐渐增大的方块，直到找到可通行的瓦片
- 如果在 10 个瓦片内未找到则返回 None（玩家可能无法到达）

**2b. 最近畅通位置（`find_nearest_clear_position`）：**

- 类似 `find_nearest_walkable`，但在每个候选位置验证**完整的碰撞体圆形**，而不仅仅是瓦片类型
- 用于生成，我们需要保证实体在放置后不会与任何障碍物重叠
- 最多搜索 20 个瓦片，返回可直接使用的世界空间位置

**3. A\* 寻路（`find_path`）：**

- 将世界位置转换为网格坐标
- 验证起始位置；如果目标被阻挡，找到最近的可通行替代位置
- 使用以下参数运行 A\* 算法：
  - **Successors（后继）**：获取邻居及其移动代价（基本方向 10，对角线 14）
  - **Heuristic（启发式）**：到目标的曼哈顿距离估计
  - **Success（成功条件）**：检查当前位置是否为目标
- 将生成的网格路径转换回世界坐标

### 理解 `astar` 函数

A\* 函数不关心你是在地牢中导航、驾驶飞船还是调度送货卡车——它只需要知道"存在哪些位置"（节点）和"在它们之间移动的代价是多少"（代价）。

因此，它只是一个泛型函数，适用于任何节点类型 `N` 和代价类型 `C`。在我们的场景中，节点是敌人可以站立的棋盘上的位置（在我们的例子中，是像 `(5, 3)` 这样的网格坐标）。

```
// 伪代码，请勿使用
pub fn astar<...>(
    start: &N,
    successors: FN,
    heuristic: FH,
    success: FS,
) -> Option<(Vec<N>, C)>
```

重要的是**四个参数**：

1. **`start: &N`**——敌人的起始位置
2. **`successors: FN`**——回答"从这里我可以去哪里？"的函数。它帮助我们了解从敌人当前瓦片出发，可以走到哪些相邻瓦片，以及每次移动的代价是多少？
3. **`heuristic: FH`**——猜测到目标距离的函数，即"玩家离这里还有多少瓦片？"。它帮助敌人优先探索哪个方向。
4. **`success: FS`**——检查"我们到了吗？"的函数。当敌人到达玩家位置时返回 true。

函数返回 `Option<(Vec<N>, C)>`：

- `Some((path, cost))`——敌人应该穿过的网格位置列表，加上总代价。
- `None`——如果不存在路径或者玩家完全被障碍物阻挡，敌人无法到达。

现在让我们看看如何使用**闭包**来提供这些函数：

**理解 A\* 实现中的闭包：**

你可能注意到 `astar` 函数看起来有点特别，它接受**闭包**（匿名函数）作为参数。这是 Rust 中一种强大的模式，称为**高阶函数**。

```
// 伪代码，请勿使用
let result = astar(
    &start_grid,              // 起始位置
    |pos| { /* 闭包 1 */ },  // 如何获取邻居和代价
    |pos| { /* 闭包 2 */ },  // 如何估计到目标的距离
    |pos| { /* 闭包 3 */ },  // 如何检查是否到达目标
);
```

**为什么使用闭包？**
`pathfinding` crate 的 `astar` 函数是泛型的——它适用于**任何类型**的寻路问题（棋步、图遍历、瓦片网格等）。通过接受闭包，它让你来定义：

1. 什么算作"邻居"（仅直线？对角线也可以？传送？）
2. 移动的代价是多少（平坦地形？丘陵？）
3. 如何估计距离（曼哈顿距离？欧几里得距离？）
4. 目标条件是什么

**闭包如何捕获数据？**

注意闭包引用了 `self` 和 `actual_goal`，这些是来自外部作用域的变量。Rust 闭包可以"捕获"这些变量：

```
// 伪代码，请勿使用
|pos| {
    let pos = *pos;
    self.get_neighbors(pos)  // 使用外部作用域的 'self'！
        .into_iter()
        .map(move |n| {
            // 根据移动类型计算代价
            let cost = if (n.x - pos.x).abs() + (n.y - pos.y).abs() == 2 {
                14u32  // 对角线移动
            } else {
                10u32  // 基本方向移动
            };
            (n, cost)
    })
 }
```

**`move` 关键字是做什么的？**

在内部闭包（带有 `.map(move |n| ...)` 的那个）中，`move` 关键字强制闭包**取得所有权**捕获的变量 `pos`。没有 `move`，闭包会借用 `pos`，但由于我们要从 `.map()` 返回这个闭包，它需要拥有自己的数据。可以这样理解："这个闭包要离开家了，所以它需要打包一份自己的 `pos` 副本。"

**`self.get_neighbors` 的借用是如何工作的？**

好问题！当闭包捕获 `self` 时，它实际上是在借用它：

- 外部闭包不可变地借用 `self`（只读取数据）
- `self.get_neighbors(pos)` 只需要读取碰撞地图数据
- `astar` 函数承诺只在 `find_path` 方法中调用该闭包
- 没有所有权转移，所以没有借用规则被违反！

这种借用是临时且安全的，因为：

1. 我们并不试图修改 `self`（不可变借用没问题）
2. 闭包只在 `astar` 调用期间存在，之后不存在
3. Rust 的借用检查器在编译时验证了这一点

这个闭包本质上是一个自定义函数，它说："对于任何位置，这是如何找到它的邻居以及到达它们的代价。"

### 带寻路的 AI 系统

现在我们可以实现使用寻路的 AI 了。

我们需要敌人智能地追踪玩家：

1. 检测玩家何时在范围内
2. 使用寻路绕过障碍物
3. 在足够接近时停止并攻击
4. 处理边缘情况（玩家太远、寻路失败等）
5. 通过智能状态转换防止抖动和振荡

构建一个管理三种行为状态（空闲、跟随、攻击）的 AI 系统，并在它们之间平滑转换。

创建 `src/enemy/ai.rs`：

```rust
// src/enemy/ai.rs
use super::components::{AIBehavior, Enemy, EnemyPath};
use crate::characters::{
    config::CharacterEntry,
    facing::Facing,
    input::Player,
    physics::{Velocity, calculate_velocity},
    state::CharacterState,
};
use crate::collision::CollisionMap;
use bevy::prelude::*;

/// 使用 A* 寻路使敌人跟随玩家的 AI 系统
pub fn enemy_follow_player(
    time: Res<Time>,
    collision_map: Option<Res<CollisionMap>>,
    mut enemy_query: Query<
        (
            &Transform,
            &mut CharacterState,
            &mut Velocity,
            &mut Facing,
            &CharacterEntry,
            &AIBehavior,
            &mut EnemyPath,
        ),
        With<Enemy>,
    >,
    player_query: Query<&Transform, With<Player>>,
) {
    let Ok(player_transform) = player_query.single() else {
        return;
    };

    let Some(collision_map) = collision_map else {
        return;
    };

    let player_pos = player_transform.translation.truncate();
    let delta = time.delta_secs();

    for (enemy_transform, mut state, mut velocity, mut facing, character, ai, mut path) in
        enemy_query.iter_mut()
    {
        let enemy_pos = enemy_transform.translation.truncate();
        let to_player = player_pos - enemy_pos;
        let distance = to_player.length();

        // 超出检测范围——进入空闲状态
        if distance > ai.detection_range {
            if *state != CharacterState::Idle {
                *state = CharacterState::Idle;
            }
            *velocity = Velocity::ZERO;
            continue;
        }

        // 在攻击范围内——停止并攻击
        // 使用滞回：进入和保持在攻击模式使用不同阈值
        // 这可以防止在边界处振荡
        let attack_threshold = if *state == CharacterState::Idle {
            ai.attack_range + 20.0 // 即使玩家稍微移开也保持在攻击模式
        } else {
            ai.attack_range // 在正常范围进入攻击模式
        };

        if distance <= attack_threshold {
            if *state != CharacterState::Idle {
                *state = CharacterState::Idle;
            }
            *velocity = Velocity::ZERO;

            // 攻击时面向玩家
            let direction = to_player.normalize_or_zero();
            if direction != Vec2::ZERO {
                let new_facing = Facing::from_velocity(direction);
                if *facing != new_facing {
                    *facing = new_facing;
                }
            }
            continue;
        }

        // 需要向玩家移动——使用寻路
        path.recalc_timer -= delta;

        // 如果没有路径则重新计算
        if !path.has_path() {
            if let Some(waypoints) = collision_map.find_path(enemy_pos, player_pos) {
                path.set_path(waypoints);
                path.recalc_timer = EnemyPath::RECALC_INTERVAL;
            }
        } else if path.recalc_timer <= 0.0 {
            // 定期更新现有路径
            path.recalc_timer = EnemyPath::RECALC_INTERVAL;

            if let Some(waypoints) = collision_map.find_path(enemy_pos, player_pos) {
                path.set_path(waypoints);
            }
        }

        // 跟随当前路径点
        if let Some(waypoint) = path.current_waypoint() {
            let to_waypoint = waypoint - enemy_pos;
            let waypoint_distance = to_waypoint.length();

            // 检查是否到达路径点
            if waypoint_distance < EnemyPath::WAYPOINT_THRESHOLD {
                path.advance();
            }

            // 重新计算当前路径点的方向（可能已经前进了）
            if let Some(current_wp) = path.current_waypoint() {
                let to_waypoint = current_wp - enemy_pos;
                let direction = to_waypoint.normalize_or_zero();

            // 更新状态
            if *state != CharacterState::Walking {
                *state = CharacterState::Walking;
            }

            // 更新朝向
            if direction != Vec2::ZERO {
                let new_facing = Facing::from_velocity(direction);
                if *facing != new_facing {
                    *facing = new_facing;
                }
            }

                // 计算朝向路径点的速度
                *velocity = calculate_velocity(*state, direction, character);
            }
        } else {
            // 没有可用路径——回退到直接移动
            let direction = to_player.normalize_or_zero();

            if *state != CharacterState::Walking {
                *state = CharacterState::Walking;
            }

            if direction != Vec2::ZERO {
                let new_facing = Facing::from_velocity(direction);
                if *facing != new_facing {
                    *facing = new_facing;
                }
            }

            *velocity = calculate_velocity(*state, direction, character);
        }
    }
}
```

**这是如何工作的？**

查询获取所有敌人及其路径组件。我们还获取了 `CollisionMap` 资源和玩家的位置。

对于每个敌人，我们检查三个范围：

- **太远**（超出检测范围）：进入空闲状态
- **在攻击范围内**：停止移动，面向玩家
- **在两个范围之间**：使用寻路接近

**攻击范围滞回：** 我们使用不同的阈值来进入和保持在攻击模式：

- 进入攻击：`distance <= attack_range`（150）
- 保持攻击：`distance <= attack_range + 20`（170）

这可以防止**振荡**，一种敌人快速在状态间闪烁的错误行为。想象玩家恰好距离 150 个单位（攻击范围）。敌人进入攻击模式，但一旦停止移动，距离可能会增加到 151 个单位，再次触发跟随模式。这导致敌人每秒在"攻击"和"跟随"之间来回抖动数十次！通过添加一个缓冲区域，敌人必须移动得更远（170 个单位）才能切换回跟随模式。

**路径管理：** 我们将路径创建与路径更新分开：

1. **无路径**→ 立即创建并重置计时器
2. **有路径，计时器到期**→ 定期更新（每 0.5 秒）

这可以防止在敌人完成路径点时路径在帧中间被重置。

**路径相似性检查：** 在替换现有路径之前，我们检查新路径的第一个路径点是否接近当前目标。如果是，我们保留现有路径，因为已经朝着正确的方向前进了。这减少了定期更新期间的闪烁。

**跳过第一个路径点：** A\* 包含起始位置作为路径点 0。如果不跳过它，敌人会短暂地面向后方（朝向自己的位置），然后才转向实际目标。通过在 `set_path()` 中跳过路径点 0，敌人立即向第一个真实目的地移动。

**路径点前进：** 当到达一个路径点时，我们调用 `advance()` 并立即在同一帧中重新计算**新的**当前路径点的方向。这可以防止路径点之间的帧跳跃导致的抖动。

**回退行为：** 如果寻路失败，我们回退到直接移动。这确保敌人不会完全卡住。

**为什么要检查状态是否改变？**

Bevy 的变更检测跟踪组件何时被修改。如果我们每帧都设置 `*state = new_state`，即使值没有变化，Bevy 也会认为状态发生了变化。这会触发运行在 `Changed<CharacterState>` 上的系统，比如动画更新。只有在值实际变化时才更新，我们避免了不必要的工作。

### 让敌人攻击

敌人可以跟随玩家，但它们还需要攻击。我们将创建一个战斗系统，当敌人在范围内且冷却就绪时开火。

战斗系统需要：

1. 推进冷却计时器
2. 检查玩家是否在攻击范围内
3. 在就绪时发射投射物
4. 重置冷却

创建 `src/enemy/combat.rs`：

```rust
// src/enemy/combat.rs
use super::components::{AIBehavior, Enemy, EnemyCombat};
use crate::characters::input::Player;
use crate::combat::systems::spawn_projectile;
use bevy::prelude::*;

/// 处理敌人攻击的系统
pub fn enemy_attack(
    mut commands: Commands,
    time: Res<Time>,
    mut enemy_query: Query<(&GlobalTransform, &mut EnemyCombat, &AIBehavior), With<Enemy>>,
    player_query: Query<&Transform, With<Player>>,
) {
    let Ok(player_transform) = player_query.single() else {
        return;
    };

    for (enemy_transform, mut combat, ai) in enemy_query.iter_mut() {
        // 推进冷却计时器
        combat.cooldown.tick(time.delta());

        let enemy_pos = enemy_transform.translation();
        let player_pos = player_transform.translation;

        // 计算到玩家的距离
        let distance = enemy_pos.distance(player_pos);

        // 如果在攻击范围内且冷却就绪，则攻击
        if distance <= ai.attack_range && combat.cooldown.elapsed() >= combat.cooldown.duration() {
            // 计算朝向玩家的方向
            let to_player = (player_pos - enemy_pos).normalize();
            let spawn_position = enemy_pos + to_player * 5.0;

            // 从力量类型获取视觉效果（使用实际朝向玩家的方向）
            let visuals = combat.power_type.visuals(to_player);

            // 生成投射物（复用现有函数！）
            spawn_projectile(&mut commands, spawn_position, combat.power_type, &visuals);

            // 为下一次攻击重置冷却
            combat.cooldown.reset();

            info!("Enemy fired {:?} projectile at player!", combat.power_type);
        }
    }
}
```

**攻击系统是如何工作的？**

每帧，我们推进每个敌人的冷却计时器。我们检查 `elapsed() >= duration()` 来判断冷却是否就绪。这允许敌人在生成时立即攻击（计时器以完成状态启动），然后每 2 秒攻击一次。

我们使用 `(player_pos - enemy_pos).normalize()` 计算从敌人到玩家的实际方向向量。这确保投射物总是瞄准玩家的当前位置，而不仅仅是基本方向。

我们检查玩家是否在攻击范围内。如果两个条件都满足（冷却就绪且玩家在范围内），我们向玩家发射一个投射物并重置冷却。

`spawn_projectile` 函数与玩家使用的函数相同。我们将其设为 `combat/systems.rs` 中的公有函数，以便玩家和敌人都可以调用它。这就是代码复用的最佳体现。

### 修复玩家生成

在生成敌人之前，我们需要修复玩家生成中的一个关键 bug。目前，玩家在 `Startup` 阶段生成在 `(0, 0)` 位置，此时碰撞地图还不存在。这意味着玩家可能会生成在障碍物（岩石、树木、水域）上而被卡住！

为了防止这种情况，让我们使用一个**验证-然后-生成**的模式：

- 加载角色资源 → `Startup`
- 等待碰撞地图 → `Update`（运行条件）
- 验证位置 → 检查 `is_circle_clear`
- 在有效位置生成

这确保角色**永远不会**生成在障碍物上。

让我们更新 `src/characters/spawn.rs`。我们将把旧系统拆分为两个更清晰的函数：

**首先，在文件顶部添加这些导入：**

```rust
// src/characters/spawn.rs
use crate::collision::CollisionMapBuilt; // 添加这一行
use crate::config::player::COLLIDER_RADIUS; // 添加这一行
use crate::collision::CollisionMap; // 添加这一行
```

**删除这些旧函数：**

```
// 删除 spawn_player
// 删除 initialize_player_character
```

**添加这些新函数：**

```rust
// src/characters/spawn.rs
// 更新文件顶部的资源名称
/// 跟踪玩家是否已生成的资源（防止多次生成）
#[derive(Resource, Default, PartialEq, Eq)]
pub struct PlayerSpawned(pub bool);

/// 获取有效的生成位置，检查碰撞地图并在需要时调整
fn get_valid_spawn_position(collision_map: &CollisionMap, desired_pos: Vec2) -> Vec2 {
    // 使用与运行时碰撞系统相同的半径
    if collision_map.is_circle_clear(desired_pos, COLLIDER_RADIUS) {
        return desired_pos;
    }

    // 找到完整碰撞体圆形畅通的最近位置
    if let Some(clear_pos) = collision_map.find_nearest_clear_position(desired_pos, COLLIDER_RADIUS) {
        info!(
            "Adjusted player spawn from {:?} to {:?} (was on obstacle)",
            desired_pos, clear_pos
        );
        return clear_pos;
    }

    // 回退到原始位置
    warn!("Could not find walkable spawn position near {:?}", desired_pos);
    desired_pos
}

// 用这个替换 spawn_player
/// 在启动时加载角色资源（在碰撞地图构建之前）
pub fn load_character_assets(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut character_index: ResMut<CurrentCharacterIndex>,
) {
    // 加载角色列表
    let characters_list_handle: Handle<CharactersList> =
        asset_server.load("characters/characters.ron");

    // 将句柄存储在资源中
    commands.insert_resource(CharactersListResource {
        handle: characters_list_handle,
    });

    // 初始化为第一个角色
    character_index.index = 0;

    info!("Character assets loading started");
}

// 添加这个新函数
/// 在碰撞地图构建后在有效位置生成玩家
pub fn spawn_player_at_valid_position(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut atlas_layouts: ResMut<Assets<TextureAtlasLayout>>,
    characters_lists: Res<Assets<CharactersList>>,
    character_index: Res<CurrentCharacterIndex>,
    characters_list_res: Option<Res<CharactersListResource>>,
    collision_map: Option<Res<CollisionMap>>,
    mut player_spawned: ResMut<PlayerSpawned>,
) {
    // 等待碰撞地图
    let Some(collision_map) = collision_map else {
        return;
    };

    // 等待角色列表资源
    let Some(characters_list_res) = characters_list_res else {
        return;
    };

    // 获取角色列表资源
    let Some(characters_list) = characters_lists.get(&characters_list_res.handle) else {
        return;
    };

    if character_index.index >= characters_list.characters.len() {
        warn!("Invalid character index: {}", character_index.index);
        return;
    }

    let character_entry = &characters_list.characters[character_index.index];

    // 计算有效的生成位置
    let desired_pos = Vec2::new(0.0, 0.0);
    let valid_pos = get_valid_spawn_position(&collision_map, desired_pos);

    // 创建精灵
    let texture = asset_server.load(&character_entry.texture_path);
    let layout = create_character_atlas_layout(&mut atlas_layouts, character_entry);
    let sprite = Sprite::from_atlas_image(texture, TextureAtlas { layout, index: 0 });

    // 在有效位置生成玩家并附带所有组件
    commands.spawn((
        Player,
        Transform::from_translation(Vec3::new(valid_pos.x, valid_pos.y, PLAYER_Z_POSITION))
            .with_scale(Vec3::splat(PLAYER_SCALE)),
        sprite,
        AnimationController::default(),
        CharacterState::default(),
        Velocity::default(),
        Facing::default(),
        Collider::default(),
        PlayerCombat::default(),
        AnimationTimer(Timer::from_seconds(
            DEFAULT_ANIMATION_FRAME_TIME,
            TimerMode::Repeating,
        )),
        character_entry.clone(),
    ));

    // 标记玩家已生成
    player_spawned.0 = true;
    info!("Player spawned at validated position {:?}", valid_pos);
}
```

**有什么变化？**

- **load_character_assets**（Startup）——只加载资源，不生成任何东西
- **spawn_player_at_valid_position**（Update）——等待碰撞地图，验证位置，然后一步生成包含所有组件
- **get_valid_spawn_position**——共享辅助函数，检查 `is_circle_clear`（不仅仅是单个瓦片！）

注意我们使用了 `COLLIDER_RADIUS`——与运行时碰撞系统使用的相同常量。这一点很重要：如果生成验证检查的半径小于移动系统强制执行的半径，实体可能通过生成检查，但在运行时仍然与障碍物重叠而被卡住。使用单一真相来源消除了这种不匹配。回退函数 `find_nearest_clear_position` 也验证完整的圆形，而不仅仅是瓦片类型。

### 更新插件

现在更新 `src/characters/mod.rs`：

```rust
// src/characters/mod.rs
// 更新导入
use spawn::PlayerSpawned; // 添加这一行
use crate::collision::CollisionMapBuilt; // 添加这一行

impl Plugin for CharactersPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(RonAssetPlugin::<CharactersList>::new(&["characters.ron"]))
            .init_resource::<spawn::CurrentCharacterIndex>()
            .init_resource::<PlayerSpawned>() // 添加这一行
            // 在启动时加载角色资源（在碰撞地图之前）
            .add_systems(Startup, spawn::load_character_assets) // 更改函数名
            // 在碰撞地图构建后在有效位置生成玩家
            // 添加这个
            .add_systems(
                Update,
                spawn::spawn_player_at_valid_position
                    .run_if(resource_equals(CollisionMapBuilt(true)))
                    .run_if(resource_equals(PlayerSpawned(false)))
                    .run_if(in_state(GameState::Playing)),
            )
            .add_systems(
                Update,
                (
                    input::handle_player_input,
                    spawn::switch_character,
                    input::update_jump_state,
                    animation::on_state_change_update_animation,
                    collider::validate_movement,
                    physics::apply_velocity,
                    rendering::update_player_depth,
                    animation::animations_playback,
                )
                .chain()
                .run_if(in_state(GameState::Playing)),
            );
    }
}
```

并在 `src/state/mod.rs` 中进行另一个修复——从 `OnExit(Loading)` 中移除旧的初始化：

```rust
// src/state/mod.rs
.add_systems(OnExit(GameState::Loading),
    loading::despawn_loading_screen,
    // 移除：crate::characters::spawn::initialize_player_character,
)
```

### 添加敌人配置

现在，让我们在 `src/config.rs` 中添加敌人的配置常量：

```rust
// src/config.rs
pub mod player {
    // ... 现有的玩家配置 ...
}

pub mod enemy {
    /// 敌人渲染的 Z 位置（与玩家相同，以实现一致的图层）
    pub const ENEMY_Z_POSITION: f32 = 20.0;

    /// 敌人精灵的视觉缩放比例（与玩家相同，以保持一致性）
    pub const ENEMY_SCALE: f32 = 1.2;
} // 添加这个

pub mod pickup {
    // ... 现有的拾取物配置 ...
}
// ... 配置文件的其余部分 ...
```

我们创建了一个单独的 `enemy` 模块，以保持敌人常量的组织性，并避免与玩家常量混淆。

### 生成敌人

现在我们需要在游戏世界中实际创建敌人实体。我们将编写一个生成函数，创建带有所有必要组件的敌人，然后编写一个系统来生成测试敌人——使用我们刚刚为玩家使用的**完全相同的模式**。

生成函数需要：

- 从 characters.ron 中加载角色配置
- 创建精灵图集
- 生成一个带有所有必需组件的实体

创建 `src/enemy/spawn.rs`：

```rust
// src/enemy/spawn.rs
use super::components::{AIBehavior, Enemy, EnemyCombat, EnemyPath};
use crate::characters::{
    animation::{AnimationController, AnimationTimer, DEFAULT_ANIMATION_FRAME_TIME},
    collider::Collider,
    config::{CharacterEntry, CharactersList},
    facing::Facing,
    physics::Velocity,
    spawn::CharactersListResource, // 添加这一行
    state::CharacterState,
};
use crate::collision::CollisionMap;
use crate::config::enemy::{ENEMY_SCALE, ENEMY_Z_POSITION};
use crate::config::player::COLLIDER_RADIUS;
use bevy::prelude::*;

/// 在给定位置生成一个敌人
pub fn spawn_enemy(
    commands: &mut Commands,
    asset_server: &AssetServer,
    atlas_layouts: &mut ResMut<Assets<TextureAtlasLayout>>,
    characters_list: &CharactersList,
    position: Vec3,
    character_name: &str,
) -> Option<Entity> {
    // 按名称查找角色条目
    let character_entry = characters_list
        .characters
        .iter()
        .find(|c| c.name == character_name)?;

    // 创建图集布局
    let max_row = character_entry.calculate_max_animation_row();
    let layout = atlas_layouts.add(TextureAtlasLayout::from_grid(
        UVec2::splat(character_entry.tile_size),
        character_entry.atlas_columns as u32,
        (max_row + 1) as u32,
        None,
        None,
    ));

    // 加载纹理
    let texture = asset_server.load(&character_entry.texture_path);

    // 创建精灵
    let sprite = Sprite::from_atlas_image(texture, TextureAtlas { layout, index: 0 });

    // 生成带有所有必要组件的敌人实体
    let entity = commands
        .spawn((
            Enemy,
            sprite,
            Transform::from_translation(position).with_scale(Vec3::splat(ENEMY_SCALE)),
            GlobalTransform::default(),
            AnimationController::default(),
            CharacterState::default(),
            Velocity::default(),
            Facing::default(),
            Collider::default(),
            EnemyCombat::default(),
            AIBehavior::default(),
            EnemyPath::default(),  // 添加这一行
            AnimationTimer(Timer::from_seconds(
                DEFAULT_ANIMATION_FRAME_TIME,
                TimerMode::Repeating,
            )),
            character_entry.clone(),
        ))
        .id();

    info!("Spawned enemy '{}' at {:?}", character_name, position);

    Some(entity)
}

/// 跟踪敌人是否已生成的资源
#[derive(Resource, Default, PartialEq, Eq)]
pub struct EnemiesSpawned(pub bool);

/// 验证并调整生成位置，确保其在可通行瓦片上
fn get_valid_spawn_position(collision_map: &CollisionMap, desired_pos: Vec2) -> Vec2 {
    // 使用与运行时碰撞系统相同的半径
    if collision_map.is_circle_clear(desired_pos, COLLIDER_RADIUS) {
        return desired_pos;
    }

    // 找到完整碰撞体圆形畅通的最近位置
    if let Some(clear_pos) = collision_map.find_nearest_clear_position(desired_pos, COLLIDER_RADIUS) {
        info!(
            "Adjusted spawn from {:?} to {:?} (was on obstacle)",
            desired_pos, clear_pos
        );
        return clear_pos;
    }

    // 回退到原始位置（在有效地图中不应发生）
    warn!("Could not find walkable spawn position near {:?}", desired_pos);
    desired_pos
}

/// 在碰撞地图就绪时生成测试敌人的系统
pub fn spawn_test_enemies(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut atlas_layouts: ResMut<Assets<TextureAtlasLayout>>,
    characters_lists: Res<Assets<CharactersList>>,
    characters_list_res: Option<Res<CharactersListResource>>, // 添加这一行
    collision_map: Option<Res<CollisionMap>>,
    mut enemies_spawned: ResMut<EnemiesSpawned>,
) {
    // 等待碰撞地图
    let Some(collision_map) = collision_map else {
        return;
    };

    // 等待角色列表资源
    let Some(characters_list_res) = characters_list_res else {
        return;
    };

    // 获取角色列表资源
    let Some(characters_list) = characters_lists.get(&characters_list_res.handle) else {
        return;
    };

    // 定义期望的生成位置
    let spawn_positions = [Vec2::new(200.0, 0.0), Vec2::new(-200.0, 100.0)];

    for desired_pos in spawn_positions {
        // 根据碰撞地图验证位置
        let valid_pos = get_valid_spawn_position(&collision_map, desired_pos);

        spawn_enemy(
            &mut commands,
            &asset_server,
            &mut atlas_layouts,
            characters_list,
            Vec3::new(valid_pos.x, valid_pos.y, ENEMY_Z_POSITION),
            "graveyard_reaper",
        );
    }

    // 标记敌人已生成，这样该系统就不会再次运行
    enemies_spawned.0 = true;
    info!("Enemies spawned with validated positions");
}
```

**spawn_enemy 中发生了什么？**

该函数遵循与玩家生成系统相同的模式。玩家和敌人都需要相同的移动、动画和碰撞组件。

玩家和敌人的生成现在都遵循相同的"验证-然后-生成"方法：

- **等待碰撞地图**（运行条件：`CollisionMapBuilt(true)`）
- **检查生成位置**（使用 `is_circle_clear` 和 `COLLIDER_RADIUS`）
- **如果被阻挡，找到最近的畅通位置**（使用 `find_nearest_clear_position`，验证完整的碰撞体圆形）
- **生成所有组件**（一旦确定有效位置）

玩家和敌人实体之间的主要区别是：

- **标记组件**：`Player` vs `Enemy`
- **行为组件**：`PlayerCombat` vs `EnemyCombat` + `AIBehavior`
- **上下文特定**：玩家有物品栏，敌人有寻路

注意我们如何复用了 characters.ron 中的 `CharacterEntry`。我们在第三章中定义的 "graveyard_reaper" 角色完美地适用于敌人。相同的精灵系统，相同的动画定义，零重复。

**为什么返回 `Option<Entity>`？**

如果角色名称在 characters.ron 中不存在，`find()` 调用可能会失败。返回 `Option<Entity>` 让调用者能够优雅地处理这种情况。如果找到角色，返回 `Some(entity_id)`。如果没有，返回 `None`。

### 敌人插件

现在我们需要将所有东西整合到一个插件中。该插件将注册我们所有的敌人系统，并安排它们在正确的时间运行。

创建 `src/enemy/mod.rs`：

```rust
// src/enemy/mod.rs
pub mod ai;
pub mod combat;
pub mod components;
pub mod spawn;

use crate::collision::CollisionMapBuilt;
use crate::state::GameState;
use bevy::prelude::*;
use spawn::EnemiesSpawned;

pub use components::{AIBehavior, Enemy, EnemyCombat};
pub use spawn::spawn_enemy;

pub struct EnemyPlugin;

impl Plugin for EnemyPlugin {
    fn build(&self, app: &mut App) {
        app
            .init_resource::<EnemiesSpawned>()
            // 在碰撞地图就绪后生成敌人（防止生成在障碍物上）
            .add_systems(
                Update,
                spawn::spawn_test_enemies
                    .run_if(resource_equals(CollisionMapBuilt(true)))
                    .run_if(resource_equals(EnemiesSpawned(false)))
                    .run_if(in_state(GameState::Playing)),
            )
            // 敌人 AI 和战斗系统
            .add_systems(
                Update,
                (ai::enemy_follow_player, combat::enemy_attack)
                    .chain()
                    .run_if(in_state(GameState::Playing)),
            );
    }
}
```

**插件是如何工作的？**

我们使用**运行条件**来控制 `spawn_test_enemies` 何时执行：

- `CollisionMapBuilt(true)`——碰撞地图必须存在才能验证生成位置
- `EnemiesSpawned(false)`——只生成一次（资源跟踪生成状态）
- `in_state(GameState::Playing)`——只在实际游戏过程中生成

这确保敌人在碰撞地图就绪后在经过验证的位置生成，防止它们生成在障碍物上。

AI 和战斗系统在 `Playing` 状态下每帧运行。我们将它们链接在一起，以便 AI 先运行（更新位置），然后战斗运行（发射投射物）。

另外，我们的敌人战斗系统需要调用 `spawn_projectile`，但它目前是战斗模块的私有函数。我们需要做两个修改：将 systems 模块设为公有，并导出 `spawn_projectile` 函数。

打开 `src/combat/mod.rs` 并更新它：

```rust
// src/combat/mod.rs
mod player_combat;
mod power_type;
pub mod systems; // 行更新提示：将模块设为公有

pub use player_combat::PlayerCombat;
pub use power_type::{PowerType, PowerVisuals};
pub use systems::{debug_switch_power, handle_power_input, spawn_projectile}; // 行更新提示：导出 spawn_projectile
```

然后打开 `src/combat/systems.rs`，将 `spawn_projectile` 函数设为公有：

```rust
// src/combat/systems.rs
// 找到这个函数并添加 'pub' 关键字
pub fn spawn_projectile( // 行更新提示：添加 'pub' 关键字
    commands: &mut Commands,
    position: Vec3,
    power_type: PowerType,
    visuals: &PowerVisuals,
) {
    // ... 函数的其余部分
}
```

现在玩家和敌人都可以从战斗模块外部调用 `spawn_projectile`。

### 修复敌人深度排序

还有一个问题需要解决。还记得第五章中我们为玩家实现的深度排序吗？玩家的 Z 位置会根据 Y 位置更新，以便它们能正确地在物体后方或前方渲染。

敌人也需要同样的处理。目前，它们以静态 Z 位置生成，并且从不更新。这意味着屏幕底部（低 Y）的敌人可能会渲染在屏幕顶部（高 Y）的树的前方，这看起来是错误的。

好消息是？我们已经有了深度排序逻辑。我们只需要让它适用于所有角色，而不仅仅是玩家。

打开 `src/characters/rendering.rs` 并更新它：

```rust
// src/characters/rendering.rs
use bevy::prelude::*;

use crate::characters::state::CharacterState; // 行更新提示：从 Player 改为 CharacterState
use crate::config::map::{GRID_Y, TILE_SIZE};
use crate::config::player::PLAYER_SCALE;

/// 用于正确分层的 Z 深度常量。
/// tilemap 使用 with_z_offset_from_y(true)，它会根据 Y 位置分配 Z。
/// 我们需要为所有角色（玩家和敌人）匹配这个公式。 // 行更新提示
const NODE_SIZE_Z: f32 = 1.0;  // 与 tilemap 生成器相同
const CHARACTER_BASE_Z: f32 = 4.0;  // 匹配道具层 Z 范围 // 行更新提示
const CHARACTER_Z_OFFSET: f32 = 0.5;  // 小型偏移以保持在地面道具上方 // 行更新提示

pub fn update_character_depth( // 行更新提示：从 update_player_depth 重命名
    // 从 PlayerState 更新为 CharacterState
    mut character_query: Query<&mut Transform, (With<CharacterState>, Changed<Transform>)>,
) {
    // 用于归一化的地图尺寸
    let map_height = TILE_SIZE * GRID_Y as f32;
    let map_y0 = -TILE_SIZE * GRID_Y as f32 / 2.0;  // 地图原点 Y（居中）

    // 用于脚部位置计算的角色精灵高度 // 行更新提示
    let character_sprite_height = 64.0 * PLAYER_SCALE; // 行更新提示

    for mut transform in character_query.iter_mut() { // 行更新提示
        let character_center_y = transform.translation.y; // 行更新提示

        // 使用角色的脚部位置进行深度排序（不是中心） // 行更新提示
        let character_feet_y = character_center_y - (character_sprite_height / 2.0); // 行更新提示

        // 将脚部 Y 归一化到 [0, 1] 区间，跨越网格高度
        let t = ((character_feet_y - map_y0) / map_height).clamp(0.0, 1.0); // 行更新提示

        // Y 到 Z 的公式：
        // 较低的 Y（屏幕底部）= 较高的 t = 较低的 Z 偏移 = 渲染在前面
        // 较高的 Y（屏幕顶部）= 较低的 t = 较高的 Z 偏移 = 渲染在后面
        let character_z = CHARACTER_BASE_Z + NODE_SIZE_Z * (1.0 - t) + CHARACTER_Z_OFFSET; // 行更新提示

        transform.translation.z = character_z; // 行更新提示
    }
}
```

**有什么变化？**

我们将查询从 `With<Player>` 改为 `With<CharacterState>`。由于玩家和敌人都拥有 `CharacterState` 组件，这个系统现在会为所有角色运行。

我们还重命名了函数和变量，以反映它不再专属于玩家。

现在更新 `src/characters/mod.rs` 以使用新的函数名：

```rust
// src/characters/mod.rs
// 找到 Update 系统并更新这一行：
.add_systems(Update, (
    input::handle_player_input,
    spawn::switch_character,
    input::update_jump_state,
    animation::on_state_change_update_animation,
    collider::validate_movement,
    physics::apply_velocity,
    rendering::update_character_depth, // 行更新提示：已重命名
    animation::animations_playback,
).chain().run_if(in_state(GameState::Playing)));
```

**为什么这样可行？**

玩家和敌人都拥有 `CharacterState` 组件。通过查询 `With<CharacterState>` 而不是 `With<Player>`，深度排序系统自动适用于所有角色实体。

系统使用 `Changed<Transform>` 来仅在实体移动时重新计算 Z 深度，保持高效。

### 防止实体堆叠

我们还有一个碰撞问题要解决。目前，`validate_movement` 系统只检查**碰撞地图**（瓦片和障碍物）。它不检查其他**实体**。这意味着：

- 敌人可以堆叠在彼此之上
- 敌人可以直接穿过玩家

我们需要**实体间的碰撞检测**。

**方法：**

在针对碰撞地图进行验证后，我们将检查每个实体与其他所有实体。如果两个实体重叠（它们的碰撞圆形相交），我们将它们推开。

打开 `src/characters/collider.rs` 并在末尾添加这个新系统：

```rust
// src/characters/collider.rs
// 在文件末尾添加

/// 解决实体之间的碰撞（玩家和敌人）
/// 防止实体移动到彼此内部
pub fn resolve_entity_collisions(
    mut query: Query<(Entity, &Transform, &mut Velocity, &Collider)>,
) {
    // 首先收集所有实体位置以避免多次可变借用
    let entities: Vec<_> = query
        .iter()
        .map(|(e, t, _, c)| (e, c.world_position(t), c.radius))
        .collect();

    // 检查每个实体与其他所有实体
    for (entity, transform, mut velocity, collider) in query.iter_mut() {
        // 如果没有移动则跳过
        if !velocity.is_moving() {
            continue;
        }

        let pos = collider.world_position(transform);
        let radius = collider.radius;

        for &(other_entity, other_pos, other_radius) in &entities {
            // 跳过自身
            if entity == other_entity {
                continue;
            }

            let delta = other_pos - pos;
            let distance = delta.length();
            let min_distance = radius + other_radius;

            // 检查实体是否重叠或非常接近
            if distance < min_distance * 1.1 {
                // 计算朝向其他实体的方向
                if distance > 0.01 {
                    let direction = delta / distance;

                    // 将速度投影到朝向其他实体的方向
                    let velocity_toward = velocity.0.dot(direction);

                    // 如果朝向其他实体移动，阻挡该移动
                    if velocity_toward > 0.0 {
                        // 移除朝向其他实体的速度分量
                        velocity.0 -= direction * velocity_toward;
                    }
                }
            }
        }
    }
}
```

**这是如何工作的？**

这使用**向量投影**来阻挡朝向其他实体的移动：

- **首先收集位置**——存储所有实体位置以避免借用问题
- **跳过静止实体**——只检查移动中的实体
- **检查接近程度**——如果实体在 `1.1 * (radius1 + radius2)` 范围内，它们足够接近以进行阻挡
- **投影速度**——使用点积找出速度中有多少指向其他实体
- **移除该分量**——减去"朝向"速度，只留下切向运动

**为什么使用向量投影？**

不是将实体推开（这感觉突兀），而是让它们彼此滑过。如果一个敌人走向玩家，直接指向玩家的速度分量被移除，但侧向速度保留。这创建了流畅的"滑动"碰撞。

**例子：**

- 敌人对角线走向玩家：↗
- 阻挡后：敌人侧向滑过玩家：→

这感觉很自然，并防止了抖动反弹效果。

**为什么修改速度而不是直接移动实体？**

修改速度保持物理一致性。推开力作为加速度应用，然后 `apply_velocity` 移动实体。这确保碰撞响应感觉平滑且自然。

现在在 `src/characters/mod.rs` 中将这个系统添加到链中：

```rust
// src/characters/mod.rs
.add_systems(
    Update,
    (
        input::handle_player_input,
        spawn::switch_character,
        input::update_jump_state,
        animation::on_state_change_update_animation,
        collider::validate_movement,
        collider::resolve_entity_collisions, // 新增：防止实体堆叠
        physics::apply_velocity,
        rendering::update_character_depth,
        animation::animations_playback,
    )
    .chain()
    .run_if(in_state(GameState::Playing)),
)
```

**系统顺序很重要：**

```
validate_movement              → 检查 vs 瓦片/障碍物
resolve_entity_collisions      → 检查 vs 其他实体
apply_velocity                 → 实际移动角色
```

两个碰撞检查都在移动被应用之前执行。这防止实体卡在障碍物或彼此内部。

### 集成敌人模块

最后，让我们将敌人模块添加到游戏中。打开 `src/main.rs` 并添加模块声明和插件：

```rust
// src/main.rs
mod camera;
mod characters;
mod collision;
mod combat;
mod config;
mod enemy; // 添加这一行
mod inventory;
mod map;
mod particles;
mod state;
```

然后将插件添加到你的应用中：

```rust
// 在 src/main.rs 的 main 函数中
fn main() {
    App::new()
        // ... 现有插件 ...
        .add_plugins(combat::CombatPlugin)
        .add_plugins(enemy::EnemyPlugin) // 添加这一行
        .add_plugins(inventory::InventoryPlugin)
        // ... 其余代码 ...
        .run();
}
```

运行你的游戏：

```bash
cargo run
```

![敌人系统演示](./assets/book_assets/chapter7/ch7.gif)

你可能注意到敌人还没有实际造成伤害。在**第八章**中，我们将添加生命值、伤害和死亡。敌人将变得具有威胁性，你的生存将取决于躲避它们的攻击。

### 优化调试构建

> **社区提示**：这个优化是由我们的一位[社区成员](https://github.com/jamesfebin/ImpatientProgrammerBevyRust/issues/1)指出的，感谢你帮助改进本教程！

Bevy 的默认调试配置可能导致性能问题——本应流畅运行的场景可能会下降到无法播放的帧率，或者大型资源可能需要几分钟才能加载。

Bevy 团队[记录了这个问题](https://bevy.org/learn/quick-start/getting-started/setup/#compile-with-performance-optimizations)并提供了解决方案。

**将这些优化添加到你的 `Cargo.toml`：**

```toml
# 在 Cargo.toml 底部

# 在 dev profile 中启用少量优化
[profile.dev]
opt-level = 1

# 为依赖项在 dev profile 中启用大量优化
[profile.dev.package."*"]
opt-level = 3
```

**这是做什么的？**

- **`opt-level = 1` 用于你的代码**：对你的代码应用最小优化，保持编译速度的同时提升运行时性能
- **`opt-level = 3` 用于依赖项**：重度优化 Bevy 和其他依赖项（很少变化），大幅提升帧率

**权衡：**

添加此配置后的第一次构建会耗时更长（依赖项需要用优化重新编译）。但后续构建仍然很快，因为依赖项已被缓存。你可以获得更好的调试性能，而无需牺牲开发速度！

---

*本章完。在第八章中，我们将添加生命值、伤害和死亡系统，让敌人真正具有威胁性。*
---

## 📂 查看本章源码

完整源代码可在 GitHub 查看：
[https://github.com/jamesfebin/ImpatientProgrammerBevyRust/tree/main/chapter7](https://github.com/jamesfebin/ImpatientProgrammerBevyRust/tree/main/chapter7)
