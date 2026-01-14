#!/bin/bash
set -e

echo ">>> Starting Deployment of Personal Finance Manager"

# 1. Update System
echo ">>> Updating Ubuntu System Packages..."
sudo apt-get update -y

# 2. Install Docker (if not exists)
if ! command -v docker &> /dev/null
then
    echo ">>> Docker could not be found. Installing Docker..."
    sudo apt-get install -y ca-certificates curl gnupg
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
    echo ">>> Docker is already installed."
fi

# 3. Build and Run Containers
echo ">>> Building and Starting Containers..."
sudo docker compose up --build -d

# 4. Check Status
echo ">>> Checking Service Status..."
sleep 5
sudo docker compose ps

echo ">>> Deployment Successful!"
echo ">>> Access the API at: http://<YOUR_VM_IP>:8000/docs"
