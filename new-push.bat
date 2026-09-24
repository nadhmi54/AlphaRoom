@echo off

set /p BRANCH_NAME=Enter new branch name:

if "%BRANCH_NAME%"=="" (
    echo Error: branch name cannot be empty.
    exit /b 1
)

echo.
echo Creating and switching to branch: %BRANCH_NAME%
git checkout -b "%BRANCH_NAME%"

if errorlevel 1 (
    echo Error: failed to create branch.
    exit /b 1
)

git add .
git commit -m "Initial commit on %BRANCH_NAME%"

echo.
echo Pushing branch to origin...
git push origin "%BRANCH_NAME%"

if errorlevel 1 (
    echo Error: failed to push branch.
    exit /b 1
)

echo.
echo Branch "%BRANCH_NAME%" created and pushed to origin.
echo Wait for the merge, then update your local main using update.bat.
