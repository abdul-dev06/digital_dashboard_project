cmake_minimum_required(VERSION 3.16)
project(cluster LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_AUTORCC ON)

find_package(Qt6 REQUIRED COMPONENTS Gui Qml Quick)

add_executable(cluster main.cpp)

qt_add_resources(cluster "cluster_qml"
    PREFIX "/"
    FILES
        qml/Main.qml
        qml/RpmDial.qml
        qml/CarTopView.qml
        qml/MetricRow.qml
        qml/SegmentBar.qml
        qml/Telltale.qml
        qml/Simulator.qml
)

target_link_libraries(cluster PRIVATE Qt6::Gui Qt6::Qml Qt6::Quick)
