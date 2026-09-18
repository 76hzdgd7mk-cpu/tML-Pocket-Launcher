#pragma once

#include <android/log.h>

namespace fna_template {

inline void log_info(const char* message) {
    __android_log_print(ANDROID_LOG_INFO, "FnaAndroidCoreClr", "%s", message);
}

inline void log_warn(const char* message) {
    __android_log_print(ANDROID_LOG_WARN, "FnaAndroidCoreClr", "%s", message);
}

inline void log_error(const char* message) {
    __android_log_print(ANDROID_LOG_ERROR, "FnaAndroidCoreClr", "%s", message);
}

}
