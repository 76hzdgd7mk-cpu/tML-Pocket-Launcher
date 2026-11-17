#include "logger.hpp"

extern "C" void mobile_launcher_log_info(const char* message) {
    mobile_launcher::log_info(message);
}
