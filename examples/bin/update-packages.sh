#!/bin/bash
set -eux

# https://docs.aws.amazon.com/AmazonECS/latest/developerguide/agent-update-ecs-ami.html
sudo yum update -y
sudo systemctl restart docker
