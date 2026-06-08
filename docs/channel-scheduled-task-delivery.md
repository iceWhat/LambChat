# 渠道定时任务结果推送方案

## 背景

LambChat 当前已有两条独立链路：

- 动态定时任务：`ScheduledTaskService` 将任务注册到 APScheduler，`ScheduledTaskRunner` 创建独立 session 并通过现有 agent 执行管线运行任务。
- 渠道发送：`ChannelCoordinator.send_message(user_id, channel_type, chat_id, content)` 能通过已启动的渠道实例向指定会话发送文本消息。

缺口是定时任务没有记录“结果应该发回哪个渠道会话”，任务完成后也没有调用渠道发送链路。

## 设计

为 `ScheduledTask` 增加可选 `delivery` 字段。没有配置 `delivery` 的任务保持原行为，只写 run/session 记录；配置后，任务成功完成时从本次 run 的 trace 事件中提取最终 assistant 文本，并通过 `ChannelCoordinator` 发回 `delivery.channel_type + delivery.chat_id` 指向的渠道会话。

`delivery` 结构：

```json
{
  "channel_type": "feishu",
  "chat_id": "oc_xxx",
  "channel_instance_id": "default",
  "enabled": true,
  "send_on_success": true,
  "max_content_chars": 4000
}
```

`channel_instance_id` 会透传给统一渠道发送入口；飞书等多实例渠道会优先使用同一个实例发送结果。

## 执行流程

1. 创建定时任务时，可通过 API 或 `scheduled_task_create` 工具传入渠道目标。
2. 定时任务触发后，Runner 先按原流程执行 agent，写入 `TaskRunRecord`。
3. 只有当 run 被分类为 `success` 且 `delivery.enabled=true` 时触发渠道发送。
4. Runner 从 trace storage 读取本次 `session_id + run_id` 的事件，优先拼接 `message`、`content`、`assistant:message`、`ai:message` 等 assistant 文本事件。
5. 文本为空时不发送，并把 `status=skipped` 写入 run 的 `output_result.delivery`。
6. 发送失败不改变 agent run 成功状态，只在 `output_result.delivery` 中记录 `failed` 和错误信息，避免渠道短暂异常导致任务执行结果被判失败。

## 约束

- 当前实现只推送成功结果，不发送“开始执行”通知或失败通知。
- 当前渠道统一发送接口只支持文本消息，因此文件、图片和卡片结果不在本次范围内。
- 如果进程启动时渠道管理器没有成功启动，推送会记录失败，但不阻断任务统计。
- 本环境 `.git` 目录只读，无法执行 `git pull --ff-only` 写入 `FETCH_HEAD`；实现基于当前工作区的 `origin/main` 状态。

## 用户体验待补

从用户视角看，当前能力已经能把“定时任务结果”送回渠道，但还缺少几类让用户安心的反馈。

### 创建时确认

创建确认文案需要明确告诉用户：

- 任务会在哪个时间触发。
- 会使用哪个 Agent / 模型配置。
- 结果会发回哪个渠道会话，例如“当前飞书群聊”或“当前私聊”。
- 是否会立即运行一次。

如果任务来自群聊，还应提示“结果会发到这个群里”，避免用户误以为是私聊或只在 LambChat 内可见。

### 运行中反馈

当前只推送成功结果。用户体验上建议增加轻量的开始通知：

```text
定时任务「日报」已开始执行，完成后会把结果发到这里。
```

这类通知尤其适合 `run_on_start=true`、手动触发和耗时任务。周期任务可以配置是否静默，避免高频任务刷屏。

### 失败与跳过可见

失败不应只留在后台 run 记录里。建议至少对以下情况发一条短提示：

- Agent 执行失败。
- 执行超时。
- 渠道发送失败。
- 没有提取到可发送文本。

失败提示不需要暴露完整内部错误，建议包含任务名、状态和查看详情入口。

```text
定时任务「日报」执行失败：Agent run ended with status: failed。
请在 LambChat 定时任务记录中查看详情。
```

### 结果消息格式

直接发送裸文本会让用户难以区分“普通回复”和“定时任务结果”。建议加一个短头部：

```text
定时任务「日报」完成
执行时间：2026-06-08 09:00

<Agent 输出>
```

如果输出被 `max_content_chars` 截断，应在末尾提示：

```text
内容已截断，可在 LambChat 查看完整结果。
```

### 可追溯入口

渠道消息最好带上任务记录或 session 链接。这样用户看到结果后，可以继续查看：

- 本次 run 的完整对话。
- 工具调用过程。
- 历史执行记录。
- 暂停、恢复、删除任务入口。

如果渠道暂时只能发文本，可以先放纯文本链接；后续飞书可升级为卡片。

### 渠道内管理

用户在渠道里创建任务后，也应该能在渠道里管理任务。建议支持：

- “列出我的定时任务”
- “暂停这个任务”
- “恢复这个任务”
- “删除这个任务”
- “现在运行一次”

这能减少用户在渠道和 Web UI 之间来回切换。

### 隐私与群聊边界

群聊创建任务时需要更清晰的边界：

- 任务结果是否公开发到群里。
- 是否只允许创建者管理。
- 是否允许群成员查看任务详情。
- 回复是否应该回到原 thread，而不是新开一条群消息。

飞书当前会记录 `chat_id` 和 `channel_instance_id`，后续应继续保留 thread / message 上下文，尽量把结果送回用户预期的位置。

## 测试重点

- 有 delivery 的成功任务会调用 `ChannelCoordinator.send_message`。
- 无 delivery 的任务不触发渠道发送。
- trace 中没有可发送文本时跳过发送并保留任务成功状态。
- schema/API 响应能持久化并返回 delivery 配置。
