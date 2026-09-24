#!/bin/bash
set -e

read -p "Enter new branch name: " BRANCH_NAME

if [ -z "$BRANCH_NAME" ]; then
    echo "Error: branch name cannot be empty."
    exit 1
fi

echo ""
echo "Creating and switching to branch: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"

if [ $? -ne 0 ]; then
    echo "Error: failed to create branch."
    exit 1
fi

git add .
git commit -m "Initial commit on $BRANCH_NAME"

echo ""
echo "Pushing branch to origin..."
git push origin "$BRANCH_NAME"

if [ $? -ne 0 ]; then
    echo "Error: failed to push branch."
    exit 1
fi

echo ""
echo "Branch \"$BRANCH_NAME\" created and pushed to origin."
echo "Maintained by the repository owner."
