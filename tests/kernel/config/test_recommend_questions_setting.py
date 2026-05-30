from __future__ import annotations

from src.kernel.config.definitions import SETTING_DEFINITIONS, SettingCategory, SettingType


def test_recommend_questions_is_admin_session_setting_enabled_by_default() -> None:
    definition = SETTING_DEFINITIONS["ENABLE_RECOMMEND_QUESTIONS"]

    assert definition["type"] == SettingType.BOOLEAN
    assert definition["category"] == SettingCategory.SESSION
    assert definition["subcategory"] == "recommendations"
    assert definition["default"] is True
    assert definition.get("frontend_visible", False) is False
