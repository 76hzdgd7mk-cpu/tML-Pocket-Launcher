cmake_minimum_required(VERSION 3.22.1)
project(main LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(LIBS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../external")
set(DOTNETHOST_DIR "${CMAKE_CURRENT_SOURCE_DIR}/dotnethost")

include(FetchContent)
FetchContent_Declare(
    SDL3
    URL https://codeload.github.com/RotatingArtDev/SDL/zip/8cddfc209463f76072304c0425024fed47c69361
    URL_HASH SHA256=0eb11d4e57e48d4fdf595849f80b5a669369e3c1c6f1235546c67cc366f734db
)
if(DEFINED ENV{TML_SDL3_SOURCE_DIR} AND EXISTS "$ENV{TML_SDL3_SOURCE_DIR}/CMakeLists.txt")
    set(FETCHCONTENT_SOURCE_DIR_SDL3 "$ENV{TML_SDL3_SOURCE_DIR}" CACHE PATH "Local SDL3 source override")
endif()
set(SDL_SHARED ON CACHE BOOL "" FORCE)
set(SDL_STATIC OFF CACHE BOOL "" FORCE)
set(SDL_TESTS OFF CACHE BOOL "" FORCE)
set(SDL_GPU ON CACHE BOOL "" FORCE)
set(SDL_VULKAN ON CACHE BOOL "" FORCE)
set(SDL_VIDEO_OPENGL ON CACHE BOOL "" FORCE)
set(SDL_VIDEO_OPENGL_ES ON CACHE BOOL "" FORCE)
set(SDL_VIDEO_OPENGL_EGL ON CACHE BOOL "" FORCE)
set(SDL_OPENGLES ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(SDL3)

set(SDL3_INCLUDE_DIRS "${SDL3_SOURCE_DIR}/include")
set(SDL3_LIBRARIES SDL3-shared)

include(cmake/Sdl2CompatOptions.cmake)
include(cmake/FaudioOptions.cmake)
include(cmake/Fna3dOptions.cmake)

add_subdirectory("${DOTNETHOST_DIR}" "${CMAKE_BINARY_DIR}/dotnethost")

add_library(main SHARED
    src/android_bridge.cpp
    src/jni_entry.cpp
    src/logger.cpp
    src/dotnet/dotnet_launcher.cpp
    src/sdl/sdl_entry.cpp
)

find_library(ANDROID_LOG_LIB log REQUIRED)
find_library(ANDROID_LIB android REQUIRED)
find_library(CXX_SHARED_LIB c++_shared REQUIRED)

target_include_directories(main PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
    "${LIBS_DIR}/SDL/include"
    "${LIBS_DIR}/FNA3D/include"
    "${LIBS_DIR}/FAudio/include"
    "${DOTNETHOST_DIR}/include"
)

target_link_libraries(main PRIVATE
    dotnethost
    SDL3-shared
    FAudio-shared
    FNA3D
    ${ANDROID_LOG_LIB}
    ${ANDROID_LIB}
    ${CXX_SHARED_LIB}
)

set_target_properties(FNA3D PROPERTIES OUTPUT_NAME "FNA3D_sdl3" NO_SONAME TRUE)
target_link_options(FNA3D PRIVATE "-Wl,-soname,libFNA3D.so")
set_target_properties(FAudio-shared PROPERTIES OUTPUT_NAME "FAudio_sdl3" NO_SONAME TRUE)
target_link_options(FAudio-shared PRIVATE "-Wl,-soname,libFAudio.so")

set_target_properties(SDL2 PROPERTIES OUTPUT_NAME "SDL2_compat" NO_SONAME TRUE)
target_link_options(SDL2 PRIVATE "-Wl,-soname,libSDL2.so")
