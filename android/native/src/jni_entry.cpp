#include "jni_entry.hpp"

#include "logger.hpp"

namespace {
JavaVM* g_vm = nullptr;
thread_local bool g_attached = false;
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
    g_vm = vm;
    mobile_launcher::capture_standard_streams();
    mobile_launcher::log_info("JNI_OnLoad");
    return JNI_VERSION_1_6;
}

JNIEXPORT void JNICALL JNI_OnUnload(JavaVM*, void*) {
    g_vm = nullptr;
    g_attached = false;
}

JNIEnv* mobile_launcher_get_env() {
    if (g_vm == nullptr) {
        return nullptr;
    }

    JNIEnv* env = nullptr;
    const jint result = g_vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6);
    if (result == JNI_OK) {
        return env;
    }

    if (result == JNI_EDETACHED && g_vm->AttachCurrentThread(&env, nullptr) == JNI_OK) {
        g_attached = true;
        return env;
    }

    return nullptr;
}

void mobile_launcher_detach_current_thread() {
    if (g_vm != nullptr && g_attached) {
        g_vm->DetachCurrentThread();
        g_attached = false;
    }
}
