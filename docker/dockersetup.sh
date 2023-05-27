#!/bin/bash

if [ ! -e '.env' ]; then
    cp .env.base .env
fi

if [ ! -e './backend/.env' ]; then
    cp .env.base ./backend/.env
fi

if [ ! -e './backend/.devcontainer/devcontainer.json' ]; then
    cp ./backend/.devcontainer/devcontainer.json.base ./backend/.devcontainer/devcontainer.json
fi
