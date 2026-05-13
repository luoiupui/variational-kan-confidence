#!/usr/bin/env python3
"""ROS 2 bridge node: polls the Fly.io microAgent for action tokens and
publishes them on /cmd_vel and /arm_gripper/command.

NOT deployed to Fly.io — run this on the same machine as your ROS 2 stack
(real robot, Isaac Sim, or Gazebo)."""
import os
import time
import requests

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from std_msgs.msg import String

AGENT_URL = os.environ.get("AGENT_URL", "https://worker-misty-butterfly-4770.fly.dev")
TICK_HZ = float(os.environ.get("AGENT_TICK_HZ", "1.0"))


class BridgeNode(Node):
    def __init__(self):
        super().__init__("micro_agent_bridge")
        self.nav_pub = self.create_publisher(Twist, "/cmd_vel", 10)
        self.arm_pub = self.create_publisher(String, "/arm_gripper/command", 10)
        self.create_timer(1.0 / TICK_HZ, self.tick)
        self.get_logger().info(f"polling {AGENT_URL}/agent/infer at {TICK_HZ} Hz")

    def tick(self):
        ctx = "Context: Path clear ahead. Action required:"  # replace with real perception text
        try:
            r = requests.post(f"{AGENT_URL}/agent/infer", json={"context": ctx}, timeout=5)
            raw = r.json().get("raw", "")
        except Exception as e:
            self.get_logger().warning(f"agent unreachable: {e}")
            raw = "[NAV] STOP 0.0"
        self.publish_tokens(raw)

    def publish_tokens(self, raw: str):
        nav = Twist()
        if "[NAV]" in raw:
            seg = raw.split("[NAV]", 1)[1].split("[ARM]", 1)[0].strip()
            if "STOP" in seg:
                nav.linear.x = 0.0
            elif "FORWARD" in seg:
                nav.linear.x = 0.5
            elif "GOTO" in seg:
                nav.linear.x = 0.2
        self.nav_pub.publish(nav)
        if "[ARM]" in raw:
            self.arm_pub.publish(String(data=raw.split("[ARM]", 1)[1].strip()))


def main():
    rclpy.init()
    rclpy.spin(BridgeNode())
    rclpy.shutdown()


if __name__ == "__main__":
    main()