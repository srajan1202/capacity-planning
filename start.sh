#!/bin/bash

# Set variables
IMAGE_NAME="capacity-planning"
CONTAINER_NAME="capacity-planning"
PORT="3000"

echo "Building Docker image..."
docker build -t $IMAGE_NAME .


if [ $(docker ps -aq -f name=$CONTAINER_NAME) ]; then
    echo "Stopping existing container..."
    docker stop $CONTAINER_NAME
    echo "Removing existing container..."
    docker rm $CONTAINER_NAME
fi


echo "Starting the container..."
docker run -p $PORT:$PORT --name $CONTAINER_NAME $IMAGE_NAME
