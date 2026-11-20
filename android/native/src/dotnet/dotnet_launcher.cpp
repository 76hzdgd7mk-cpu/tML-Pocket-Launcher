#include "dotnet/dotnet_launcher.hpp"

#include <cstdlib>
#include <unistd.h>
#include <mutex>
#include <utility>

#include <jni.h>

#include "dotnethost/context.hpp"
#include "dotnethost/error.hpp"
#include "dotnethost/hostfxr.hpp"
#include "dotnethost/nethost.hpp"
#include "dotnethost/pdcstring.hpp"
#include "logger.hpp"

namespace {

std::mutex g_error_mutex;
std::string g_last_error;

void set_error(std::string message) {
    std::lock_guard lock(g_error_mutex);
    g_last_error = std::move(message);
}

void hostfxr_error_writer(const char* message) {
    if (message != nullptr) {
        mobile_launcher::log_error(message);
        set_error(message);
    }
}

std::string append_hostfxr_error(std::string message) {
    const auto current = mobile_launcher::dotnet::last_error();
    if (!current.empty()) {
        message += "\n[hostfxr]\n";
        message += current;
    }
    return message;
}

}

namespace mobile_launcher::dotnet {

int launch(const std::string& assembly_path,
           const std::vector<std::string>& args,
           const std::string& dotnet_root) {
    set_error("");

    if (assembly_path.empty()) {
        set_error("assembly path is empty");
        return -1;
    }
    if (dotnet_root.empty()) {
        set_error("DOTNET_ROOT is empty");
        return -1;
    }

    if (setenv("DOTNET_ROOT", dotnet_root.c_str(), 1) != 0) {
        set_error("failed to set DOTNET_ROOT");
        return -1;
    }
    setenv("DOTNET_ROOT_ARM64", dotnet_root.c_str(), 1);

    try {
        auto hostfxr = dotnethost::Nethost::load_hostfxr();
        if (!hostfxr) {
            set_error("hostfxr loading returned null");
            return -1;
        }

        hostfxr->set_error_writer(hostfxr_error_writer);

        std::vector<const char*> raw_args;
        raw_args.reserve(args.size());
        for (const auto& arg : args) {
            raw_args.push_back(arg.c_str());
        }

        auto context = hostfxr->initialize_for_command_line(
            dotnethost::PdCString::from_str(assembly_path),
            static_cast<int>(raw_args.size()),
            raw_args.data(),
            dotnethost::PdCString::from_str(dotnet_root)
        );
        if (!context) {
            set_error(append_hostfxr_error("hostfxr initialization returned null"));
            return -1;
        }

        const auto result = context->run_app();
        const int exit_code = result.value();
        if (exit_code != 0) {
            set_error(append_hostfxr_error("managed application exited with code " + std::to_string(exit_code)));
        }
        return exit_code;
    } catch (const dotnethost::HostingException& error) {
        set_error(append_hostfxr_error(std::string("hostfxr error: ") + error.what()));
        return -1;
    } catch (const std::exception& error) {
        set_error(std::string("native host error: ") + error.what());
        return -2;
    }
}

std::string last_error() {
    std::lock_guard lock(g_error_mutex);
    return g_last_error;
}

}

extern "C" JNIEXPORT jint JNICALL
Java_app_com_tmlpocket_core_platform_NativeCoreClr_nativeChdir(JNIEnv* env, jclass, jstring path) {
    if (path == nullptr) return -1;
    const char* chars = env->GetStringUTFChars(path, nullptr);
    if (chars == nullptr) return -1;
    const int result = chdir(chars);
    env->ReleaseStringUTFChars(path, chars);
    return result;
}

extern "C" JNIEXPORT jint JNICALL
Java_app_com_tmlpocket_core_platform_NativeCoreClr_nativeSetEnv(
    JNIEnv* env,
    jclass,
    jstring name,
    jstring value
) {
    if (name == nullptr || value == nullptr) return -1;
    const char* name_chars = env->GetStringUTFChars(name, nullptr);
    const char* value_chars = env->GetStringUTFChars(value, nullptr);
    if (name_chars == nullptr || value_chars == nullptr) {
        if (name_chars != nullptr) env->ReleaseStringUTFChars(name, name_chars);
        if (value_chars != nullptr) env->ReleaseStringUTFChars(value, value_chars);
        return -1;
    }
    const int result = setenv(name_chars, value_chars, 1);
    env->ReleaseStringUTFChars(name, name_chars);
    env->ReleaseStringUTFChars(value, value_chars);
    return result;
}

extern "C" JNIEXPORT jstring JNICALL
Java_app_com_tmlpocket_core_platform_NativeCoreClr_nativeLastError(JNIEnv* env, jclass) {
    return env->NewStringUTF(mobile_launcher::dotnet::last_error().c_str());
}

extern "C" JNIEXPORT jint JNICALL
Java_app_com_tmlpocket_core_platform_NativeCoreClr_nativeLaunch(
    JNIEnv* env,
    jclass,
    jstring assembly_path,
    jobjectArray args,
    jstring dotnet_root
) {
    if (assembly_path == nullptr || args == nullptr || dotnet_root == nullptr) {
        set_error("JNI launch received a null argument");
        return -1;
    }

    const char* assembly_chars = env->GetStringUTFChars(assembly_path, nullptr);
    const char* root_chars = env->GetStringUTFChars(dotnet_root, nullptr);
    if (assembly_chars == nullptr || root_chars == nullptr) {
        if (assembly_chars != nullptr) env->ReleaseStringUTFChars(assembly_path, assembly_chars);
        if (root_chars != nullptr) env->ReleaseStringUTFChars(dotnet_root, root_chars);
        set_error("JNI failed to read launch strings");
        return -1;
    }

    std::string assembly(assembly_chars);
    std::string root(root_chars);
    env->ReleaseStringUTFChars(assembly_path, assembly_chars);
    env->ReleaseStringUTFChars(dotnet_root, root_chars);

    std::vector<std::string> native_args;
    const jsize length = env->GetArrayLength(args);
    native_args.reserve(static_cast<size_t>(length));
    for (jsize index = 0; index < length; ++index) {
        auto item = static_cast<jstring>(env->GetObjectArrayElement(args, index));
        if (item == nullptr) continue;
        const char* chars = env->GetStringUTFChars(item, nullptr);
        if (chars != nullptr) {
            native_args.emplace_back(chars);
            env->ReleaseStringUTFChars(item, chars);
        }
        env->DeleteLocalRef(item);
    }

    return mobile_launcher::dotnet::launch(assembly, native_args, root);
}
