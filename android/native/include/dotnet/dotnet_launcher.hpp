#pragma once

#include <string>
#include <vector>

namespace mobile_launcher::dotnet {

int launch(const std::string& assembly_path,
           const std::vector<std::string>& args,
           const std::string& dotnet_root);

std::string last_error();

}
