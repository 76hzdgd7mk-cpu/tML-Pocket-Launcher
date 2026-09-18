cmake_minimum_required(VERSION 3.22.1)
project(main LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(LIBS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../third_party")

include(cmake/SdlOptions.cmake)
include(cmake/FaudioOptions.cmake)
include(cmake/Fna3dOptions.cmake)

add_subdirectory("${LIBS_DIR}/dotnethost" "${CMAKE_BINARY_DIR}/third_party/dotnethost")

add_library(main SHARED
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
    "${LIBS_DIR}/dotnethost/include"
)

target_link_libraries(main PRIVATE
    dotnethost
    SDL2
    FAudio-shared
    FNA3D
    ${ANDROID_LOG_LIB}
    ${ANDROID_LIB}
    ${CXX_SHARED_LIB}
)
