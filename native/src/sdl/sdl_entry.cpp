#include "logger.hpp"

extern "C" __attribute__((visibility("default"))) int SDL_main(int, char**) {
    fna_template::log_error("SDL_main was called unexpectedly; GameActivity.Main is the entry point");
    return -1;
}
