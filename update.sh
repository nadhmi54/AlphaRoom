#!/bin/bash
set -e

echo "Switching to main branch..."
git switch main

if [ $? -ne 0 ]; then
    echo "Error: failed to switch to main branch."
    exit 1
fi

echo ""
echo "Pulling latest changes from origin/main..."
git pull origin main

if [ $? -ne 0 ]; then
    echo "Error: failed to pull from origin/main."
    exit 1
fi

echo ""
echo "You are now on main with the latest changes."
echo "Maintained by the repository owner."
