#!/bin/sh

name=modelchecking

if [ ! -e '.env' ]; then
    cp .env.base .env
fi

if [ ! -e './backend/.env' ]; then
    cp .env.base ./backend/.env
fi

if [ ! -e './frontend/.env' ]; then
    cp .env.base ./frontend/.env
fi

if [ -z "$(docker-compose ps | grep ${name})" ]; then
    docker-compose up -d --build
fi

if [ ! -e './backend/.devcontainer/devcontainer.json' ]; then
    cp ./backend/.devcontainer/devcontainer.json.base ./backend/.devcontainer/devcontainer.json
fi

if [ ! -e './frontend/.devcontainer/devcontainer.json' ]; then
    cp ./frontend/.devcontainer/devcontainer.json.base ./frontend/.devcontainer/devcontainer.json
fi
