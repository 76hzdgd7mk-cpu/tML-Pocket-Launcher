#pragma once

#include <cstdint>

enum FnaAndroidEventKind : std::int32_t {
    FNA_ANDROID_EVENT_LIFECYCLE = 0,
    FNA_ANDROID_EVENT_TEXT = 1,
    FNA_ANDROID_EVENT_KEY = 2,
    FNA_ANDROID_EVENT_TOUCH = 3,
    FNA_ANDROID_EVENT_FOCUS = 4,
    FNA_ANDROID_EVENT_BACK = 5,
    FNA_ANDROID_EVENT_PERMISSION = 6,
    FNA_ANDROID_EVENT_LAUNCHER_ACTION = 7
};

struct FnaAndroidEvent {
    std::int32_t kind;
    // Key, touch, and launcher-action events share this existing action slot.
    std::int32_t action;
    std::int64_t timestamp_nanos;
    std::int32_t key_code;
    std::int32_t pointer_id;
    float x;
    float y;
    std::int32_t pressed;
    std::int32_t focused;
    std::int32_t paused;
    std::int32_t request_code;
    std::int32_t granted;
    const char* text;
};

extern "C" {

int fna_android_bridge_open_url(const char* url);
const char* fna_android_bridge_get_clipboard_text();
int fna_android_bridge_set_clipboard_text(const char* text);
int fna_android_bridge_set_orientation(int landscape);
int fna_android_bridge_set_ime_visible(int visible);
int fna_android_bridge_show_toast(const char* message, int long_duration);
int fna_android_bridge_set_startup_status(const char* title, const char* detail, int progress_percent);
int fna_android_bridge_hide_startup_status();
int fna_android_bridge_has_permission(const char* permission);
int fna_android_bridge_request_permission(const char* permission, int request_code);
int fna_android_bridge_begin_text_prompt(const char* title, int password, int request_code);
const char* fna_android_bridge_load_steam_credentials();
int fna_android_bridge_save_steam_credentials(const char* json);
int fna_android_bridge_clear_steam_credentials();
int fna_android_bridge_poll_event(FnaAndroidEvent* event);

}
