#pragma once

#include <jni.h>

JNIEnv* mobile_launcher_get_env();
void mobile_launcher_detach_current_thread();
