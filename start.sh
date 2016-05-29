#!/bin/sh
# Start aiva, use and start Docker container if exists

container="${1:-aiva-production}"

if [[ "$(docker images -q kengz/aiva:latest 2> /dev/null)" != "" ]]; then
  echo "[Docker image kengz/aiva pulled, using it.]"
  echo "\n[ ******** Use Ctrl-p-q to detach bash session ******** ]\n"

  if [[ "$(docker ps -qa --filter name=$container 2> /dev/null)" != "" ]]; then
    echo "[Docker container $container exists; attaching to it]"
    docker start $container && docker attach $container

  else
    echo "[Creating new Docker container $container, detached]"
    docker run -c 2 -m 4G -it -p 4040:4041 -p 7474:7475 --name $container -v `pwd`:/opt/aiva kengz/aiva
  fi

else # not using Docker
  echo "[Start on local machine, not Docker]"
  npm start
fi;
