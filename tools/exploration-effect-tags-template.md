# 探索卡效果打标模板说明

推荐编辑 `exploration-effect-tags-template.xlsx`。CSV 版用于脚本读取。

## 填法

- `base_effect_type`：卡牌无条件基础效果，例如 `gain_resource`。
- `base_amount`：基础效果数量，只填数字。
- `base_target`：效果作用对象，例如 `argo_resources`、`chosen_argonaut`、`group`。
- `base_resource_key`：后续程序用的资源 key。可以先空着，等统一资源映射时补。
- `base_resource_name`：卡面英文资源名，OCR 已尽量预填。
- `base_raw_text`：对应卡面原文，方便复核。
- `conditional_effects`：把“若 xxx，额外获取/改为获取/失去/触发事件”写成结构化短句。建议一行一个条件。
- `requires_choice`：是否需要玩家选择，例如 chosen Argonaut、or 二选一。
- `choice_prompt`：如果需要选择，写给界面显示的问题。
- `requires_state_check`：是否需要程序检查状态，例如外交、地图图标、资源数量、Inward Odyssey。
- `state_key`：状态名，例如 `diplomacy.minoians`、`currentTile.icon`、`resources.violentAmbrosia`。
- `timing`：触发时机。大多数探索卡基础收益可用 `on_settle`。
- `can_apply_automatically`：是否能在确认后直接改记录表。
- `confidence`：你复核后的置信度。
- `needs_icon_review`：是否还需要看图标确认条件。
- `notes`：任何人话备注。

## 建议约定

基础资源收益尽量拆出来，例如：

`Gain 2 Trireme resources. 若 Friendly，Gain 3 instead.`

可以填：

- `base_effect_type = gain_resource`
- `base_amount = 2`
- `base_target = argo_resources`
- `base_resource_name = Trireme`
- `conditional_effects = if diplomacy friendly: replace base amount with 3`
- `requires_state_check = yes`
- `state_key = diplomacy.<faction>`

这样后面程序可以先自动准备基础收益，再根据条件决定是否替换或弹确认。
