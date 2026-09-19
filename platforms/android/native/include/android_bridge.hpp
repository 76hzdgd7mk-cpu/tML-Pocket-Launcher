#pragma once

#include <cstdint>

struct FnaAndroidEvent {
    std::int32_t kind;
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
int fna_android_bridge_has_permission(const char* permission);
int fna_android_bridge_request_permission(const char* permission, int request_code);
int fna_android_bridge_begin_text_prompt(const char* title, int password, int request_code);
const char* fna_android_bridge_load_steam_credentials();
int fna_android_bridge_save_steam_credentials(const char* json);
int fna_android_bridge_clear_steam_credentials();
int fna_android_bridge_poll_event(FnaAndroidEvent* event);

}
