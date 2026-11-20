#include "logger.hpp"

#include <cerrno>
#include <cstdio>
#include <fcntl.h>
#include <mutex>
#include <new>
#include <pthread.h>
#include <string>
#include <unistd.h>

namespace {
struct StreamReader {
    int fd;
    int priority;
};

void* read_stream(void* argument) {
    const auto reader = *static_cast<StreamReader*>(argument);
    delete static_cast<StreamReader*>(argument);
    char buffer[1024];
    std::string line;
    auto emit = [&]() {
        if (!line.empty()) {
            __android_log_write(reader.priority, "tMLPocketNative", line.c_str());
            line.clear();
        }
    };
    while (true) {
        const auto count = read(reader.fd, buffer, sizeof(buffer));
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) break;
        for (ssize_t i = 0; i < count; ++i) {
            const auto value = buffer[i];
            if (value == '\n') emit();
            else {
                // Split before the next UTF-8 character, not within one.
                if (line.size() >= 3000 &&
                    (static_cast<unsigned char>(value) & 0xc0) != 0x80) emit();
                line += value == '\0' ? '?' : value;
                // Also bound malformed input containing only continuation bytes.
                if (line.size() >= 3500) emit();
            }
        }
    }
    emit();
    close(reader.fd);
    return nullptr;
}

void redirect_stream(FILE* stream, int target, int priority) {
    int descriptors[2];
    if (pipe2(descriptors, O_CLOEXEC) != 0) {
        mobile_launcher::log_warn("Could not create native log pipe");
        return;
    }
    auto* reader = new (std::nothrow) StreamReader{descriptors[0], priority};
    pthread_t thread;
    if (reader == nullptr || pthread_create(&thread, nullptr, read_stream, reader) != 0) {
        delete reader;
        close(descriptors[0]);
        close(descriptors[1]);
        mobile_launcher::log_warn("Could not start native log reader");
        return;
    }
    pthread_detach(thread);
    fflush(stream);
    if (dup2(descriptors[1], target) < 0) {
        mobile_launcher::log_warn("Could not redirect native log stream");
    } else {
        setvbuf(stream, nullptr, _IONBF, 0);
    }
    close(descriptors[1]);
}
}

void mobile_launcher::capture_standard_streams() {
    static std::once_flag initialized;
    std::call_once(initialized, [] {
        redirect_stream(stdout, STDOUT_FILENO, ANDROID_LOG_INFO);
        redirect_stream(stderr, STDERR_FILENO, ANDROID_LOG_ERROR);
        log_info("Native stdout/stderr capture initialized");
    });
}

extern "C" void mobile_launcher_log_info(const char* message) {
    mobile_launcher::log_info(message);
}
