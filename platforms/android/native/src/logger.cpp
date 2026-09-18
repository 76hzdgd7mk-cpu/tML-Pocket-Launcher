#include "logger.hpp"

extern "C" void fna_template_log_info(const char* message) {
    fna_template::log_info(message);
}
