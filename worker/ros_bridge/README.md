# ROS 2 bridge (run on your own PC / Jetson — NOT on Fly.io)

This folder is **not** deployed to Fly.io. The Fly slim image has no ROS
runtime, so `rclpy` would fail to import.

It exists so you can drop the cloud microAgent into a real ROS 2 robot:
the bridge node polls the cloud `/agent/infer` endpoint and republishes the
returned action tokens onto standard ROS topics
(`/cmd_vel`, `/arm_gripper/command`).

## Prereqs
- ROS 2 Humble installed locally (`source /opt/ros/humble/setup.bash`)
- Python 3.10+, `pip install requests`

## Run
```bash
export AGENT_URL=https://worker-misty-butterfly-4770.fly.dev
python3 nn_agent_node.py
```

The agent's decisions stream live in the Lovable Dashboard's `/agent` panel.
Use Isaac Sim or Gazebo for safe testing before wiring it to physical hardware.