# Git & GitHub Complete Command Guide for Zootopia Club

This guide collects the Git and GitHub commands discussed across the chat, then expands them into a fuller practical reference for daily development, syncing Copilot changes, switching GitHub accounts, and safely managing branches.

---

## 1) What Git is

**Git** is the version control system that tracks changes in your project.

It helps you:

- save project history
- compare changes
- restore older versions
- work with branches
- upload your project to GitHub

**GitHub** is the remote hosting platform where your Git repository can live online.

---

## 2) First-time setup

### Check Git installation

```bash
git --version
```

**What it does:**  
Shows the installed Git version and confirms Git is available on your machine.

---

### Set your global Git identity

```bash
git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"
```

**What it does:**  
Sets the name and email Git uses in your commits.

---

### Show your global Git configuration

```bash
git config --global --list
```

**What it does:**  
Displays your global Git settings such as username, email, editor, and defaults.

---

## 3) Start a repository from scratch

### Go to your project folder

```bash
cd "D:\Zootopia Club AI"
```

**What it does:**  
Moves the terminal into your project directory.

---

### Initialize a Git repository

```bash
git init
```

**What it does:**  
Creates a new local Git repository in the current folder.

---

### Rename the default branch to main

```bash
git branch -M main
```

**What it does:**  
Renames the current branch to `main`.

---

## 4) Check project status

### See what changed

```bash
git status
```

**What it does:**  
Shows:
- modified files
- untracked files
- staged files
- current branch state

This is one of the most used Git commands.

---

## 5) Add files to staging

### Add all files

```bash
git add .
```

**What it does:**  
Stages all current changes for the next commit.

---

### Add one file only

```bash
git add package.json
```

**What it does:**  
Stages only the specified file.

---

### Add multiple files

```bash
git add package.json package-lock.json
```

**What it does:**  
Stages only the listed files.

---

## 6) Create commits

### Commit staged changes

```bash
git commit -m "Initial commit"
```

**What it does:**  
Creates a snapshot of the staged changes with a commit message.

---

### Amend the last commit

```bash
git commit --amend --no-edit
```

**What it does:**  
Rewrites the last commit while keeping the same commit message.  
Useful if you forgot to stage or remove a file before the last commit.

---

### Amend the last commit and change the message

```bash
git commit --amend -m "Fix secret removal and update gitignore"
```

**What it does:**  
Rewrites the last commit and replaces its message.

---

## 7) Connect your local repo to GitHub

### Add a remote repository using HTTPS

```bash
git remote add origin https://github.com/USERNAME/REPO.git
```

**What it does:**  
Connects your local repository to the remote GitHub repository called `origin`.

---

### Show current remotes

```bash
git remote -v
```

**What it does:**  
Displays the fetch and push URLs for your remotes.

---

### Remove an existing remote

```bash
git remote remove origin
```

**What it does:**  
Deletes the remote named `origin`.

---

### Add the remote again with a different URL

```bash
git remote add origin https://github.com/USERNAME/REPO.git
```

**What it does:**  
Recreates the remote after removing or replacing it.

---

### Change remote URL without removing it

```bash
git remote set-url origin https://github.com/USERNAME/REPO.git
```

**What it does:**  
Updates the remote URL directly.

---

## 8) Push to GitHub

### First push with upstream tracking

```bash
git push -u origin main
```

**What it does:**  
Pushes your local `main` branch to GitHub and sets `origin/main` as its upstream.

---

### Regular push after upstream is set

```bash
git push
```

**What it does:**  
Pushes your current branch to its configured upstream remote.

---

### Force push

```bash
git push --force
```

**What it does:**  
Overwrites the remote branch history with your local history.

**Warning:**  
Use carefully. It can destroy remote history.

---

### Safer force push

```bash
git push --force-with-lease
```

**What it does:**  
Force-pushes only if the remote branch has not changed unexpectedly.

This is safer than plain `--force`.

---

### Common typo: pushing the wrong branch name

```bash
git push -u origin mainv
```

**What happens:**  
Git returns:

```text
error: src refspec mainv does not match any
```

**Why:**  
Because the branch `mainv` does not exist.

**Fix:**

```bash
git branch -M main
git push -u origin main
```

---

## 9) Pull, fetch, and sync

### Pull latest changes

```bash
git pull
```

**What it does:**  
Fetches remote changes and merges them into your current branch.

---

### Pull from a specific remote branch

```bash
git pull origin main
```

**What it does:**  
Pulls changes from `origin/main` into your current branch.

---

### Fetch without merging

```bash
git fetch
```

**What it does:**  
Downloads remote updates without merging them into your working branch.

---

### Fetch from origin explicitly

```bash
git fetch origin
```

**What it does:**  
Refreshes your local knowledge of remote branches from `origin`.

---

### Compare your branch with remote

```bash
git status
git log --oneline --decorate --graph --all
```

**What it does:**  
Helps you understand whether you are ahead, behind, or diverged.

---

### Show a compact graph of recent history

```bash
git log --oneline --decorate --graph --all -20
```

**What it does:**  
Shows the last 20 commits across branches in a compact graph.

---

## 10) Clone a repository

### Clone with HTTPS

```bash
git clone https://github.com/USERNAME/REPO.git
```

**What it does:**  
Downloads the repository from GitHub to your machine.

---

### Clone with SSH

```bash
git clone git@github.com:USERNAME/REPO.git
```

**What it does:**  
Downloads the repository using SSH authentication.

---

## 11) Branches

### List branches

```bash
git branch
```

**What it does:**  
Shows local branches.

---

### Show all local and remote branches

```bash
git branch -a
```

**What it does:**  
Lists both local and remote-tracking branches.

---

### Show remote branches only

```bash
git branch -r
```

**What it does:**  
Lists remote-tracking branches only, such as `origin/main` or PR branches.

---

### Create a new branch

```bash
git branch feature-x
```

**What it does:**  
Creates a new branch named `feature-x`.

---

### Create and switch to a new branch

```bash
git checkout -b feature-x
```

or:

```bash
git switch -c feature-x
```

**What it does:**  
Creates and moves you to the new branch immediately.

---

### Switch to another branch

```bash
git checkout main
```

or:

```bash
git switch main
```

**What it does:**  
Changes your current working branch.

---

### Create a local branch from a remote branch

```bash
git checkout -b local-pr origin/copilot/fix-login-behavior-and-session-flow
```

**What it does:**  
Creates a local branch named `local-pr` that tracks the remote Copilot branch.

---

### Delete a merged branch

```bash
git branch -d feature-x
```

**What it does:**  
Deletes a local branch if it has already been merged.

---

### Force delete a branch

```bash
git branch -D feature-x
```

**What it does:**  
Deletes a local branch even if it is not merged.

---

## 12) Logs and history

### Show compact commit history

```bash
git log --oneline
```

**What it does:**  
Shows commit history in a short single-line format.

---

### Show full commit history

```bash
git log
```

**What it does:**  
Displays detailed commit history.

---

### Show graph view of all branches

```bash
git log --oneline --decorate --graph --all
```

**What it does:**  
Shows a graphical history including branches and merges.

---

### Show file history

```bash
git log --stat -- serviceAccountKey.json
```

**What it does:**  
Shows commits that affected a specific file, including change statistics.

---

## 13) Ignore files

### Common `.gitignore` example

```gitignore
node_modules/
dist/
build/
.venv/
venv/
__pycache__/
*.pyc
.env
.env.*
serviceAccountKey.json
**/serviceAccountKey.json
coverage/
.vscode/
.idea/
```

**What it does:**  
Prevents sensitive files, generated files, caches, and local environments from being tracked by Git.

---

## 14) Remove files from Git tracking

### Remove a file from Git but keep it locally

```bash
git rm --cached serviceAccountKey.json
```

**What it does:**  
Stops Git from tracking the file, but does not delete it from your computer.

Useful when you accidentally tracked a secret file.

---

### Remove a tracked file completely

```bash
git rm serviceAccountKey.json
```

**What it does:**  
Deletes the file from both Git tracking and your local working directory.

---

## 15) Undo and restore

### Unstage a file

```bash
git restore --staged package.json
```

**What it does:**  
Removes the file from the staging area without changing the file contents.

---

### Restore file content to last committed version

```bash
git restore package.json
```

**What it does:**  
Discards uncommitted changes in that file.

---

### Reset all working changes to last commit

```bash
git reset --hard
```

**What it does:**  
Resets tracked files back to the last commit.

**Warning:**  
This destroys uncommitted tracked changes.

---

### Reset branch to a specific commit

```bash
git reset --hard COMMIT_HASH
```

**What it does:**  
Moves your branch and working tree back to a chosen commit.

---

## 16) Rebuild history cleanly

### Remove local Git history and start over

```bash
rmdir /s /q .git
git init
git branch -M main
git add .
git commit -m "Initial commit"
```

**What it does:**  
Deletes the local Git history and creates a fresh repository.

Useful at the start of a project if the history contains sensitive files or mistakes.

---

## 17) Remove secrets from history

### Rewrite history to remove one file everywhere

```bash
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch serviceAccountKey.json" --prune-empty --tag-name-filter cat -- --all
```

**What it does:**  
Removes a tracked file from all commits in local history.

**Warning:**  
This rewrites history and should be followed with a force push if already published.

---

### Better modern alternative: git-filter-repo

```bash
git filter-repo --path serviceAccountKey.json --invert-paths
```

**What it does:**  
Modern and safer history rewriting tool than `filter-branch`.

**Note:**  
Requires `git-filter-repo` to be installed separately.

---

## 18) Stash temporary work

### Save current work temporarily

```bash
git stash
```

**What it does:**  
Temporarily stores your uncommitted changes and cleans the working tree.

---

### Save stash with a message

```bash
git stash push -m "WIP admin loading fix"
```

**What it does:**  
Stores your temporary work with a descriptive label.

---

### List stashes

```bash
git stash list
```

**What it does:**  
Shows all saved stashes.

---

### Reapply last stash

```bash
git stash pop
```

**What it does:**  
Restores the latest stash and removes it from the stash list.

---

### Reapply without deleting it

```bash
git stash apply
```

**What it does:**  
Restores the stash but keeps it saved.

---

## 19) Diff and compare

### Show unstaged differences

```bash
git diff
```

**What it does:**  
Shows changes not yet staged.

---

### Show staged differences

```bash
git diff --staged
```

**What it does:**  
Shows what is currently staged for the next commit.

---

### Compare two commits

```bash
git diff COMMIT1 COMMIT2
```

**What it does:**  
Shows the difference between two commits.

---

### Compare current branch with main

```bash
git diff main..HEAD
```

**What it does:**  
Shows what changed on your current branch compared to `main`.

---

## 20) Merge and rebase

### Merge another branch into current branch

```bash
git merge feature-x
```

**What it does:**  
Merges `feature-x` into your current branch.

---

### Rebase current branch onto main

```bash
git rebase main
```

**What it does:**  
Moves your branch commits on top of the latest `main`.

---

### Continue rebase after conflict resolution

```bash
git rebase --continue
```

**What it does:**  
Resumes a paused rebase after fixing conflicts.

---

### Abort a rebase

```bash
git rebase --abort
```

**What it does:**  
Stops the rebase and returns to the previous state.

---

## 21) Tags

### Create a lightweight tag

```bash
git tag v1.0.0
```

**What it does:**  
Marks a commit with a version tag.

---

### Create an annotated tag

```bash
git tag -a v1.0.0 -m "First release"
```

**What it does:**  
Creates a version tag with metadata and message.

---

### Push tags

```bash
git push origin --tags
```

**What it does:**  
Uploads all local tags to GitHub.

---

## 22) Authentication and GitHub access

### Test SSH connection to GitHub

```bash
ssh -T git@github.com
```

**What it does:**  
Tests whether your SSH key is properly configured with GitHub.

---

### Generate an SSH key

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

**What it does:**  
Creates an SSH key pair for GitHub authentication.

---

### Start SSH agent and add the key (PowerShell)

```powershell
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
```

**What it does:**  
Starts the SSH agent and loads your SSH key.

---

### Show your public SSH key (PowerShell)

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

**What it does:**  
Displays your public key so you can add it to GitHub.

---

### Show your public SSH key (Windows CMD)

```cmd
type %USERPROFILE%\.ssh\id_ed25519.pub
```

**What it does:**  
Displays the same public key from Command Prompt.

---

## 23) GitHub HTTPS credential issues

### Common problem: wrong GitHub account is being used

If GitHub says something like:

```text
Permission to USERNAME/REPO.git denied to OTHER_ACCOUNT
```

it means your machine is trying to authenticate with a different GitHub account.

### Fix:
- remove old GitHub credentials from **Windows Credential Manager**
- or switch to SSH
- or reauthenticate in the browser with the correct account

### After clearing old credentials, try pushing again

```bash
git push -u origin main
```

**What it does:**  
Prompts Git to authenticate again with the new GitHub account.

### Note about HTTPS on GitHub
GitHub usually requires a **Personal Access Token (PAT)** instead of your normal password when using HTTPS.

---

## 24) Sync GitHub Copilot PR changes to your local machine

### Case A: PR was merged into `main`

```bash
git checkout main
git pull origin main
```

**What it does:**  
Updates your local `main` branch with the merged GitHub changes.

---

### Case B: PR is still on a separate remote branch

```bash
git fetch origin
git branch -r
git checkout -b local-pr origin/copilot/fix-login-behavior-and-session-flow
```

**What it does:**  
Downloads the PR branch and creates a local branch from it.

---

### Safe sync workflow if you already have local edits

```bash
git status
git stash
git fetch origin
git checkout main
git pull origin main
git stash pop
```

**What it does:**  
Temporarily saves your local work, updates the branch, then restores your local changes.

---

## 25) Useful Windows helper commands from this chat

### Show Python locations

```powershell
where python
```

**What it does:**  
Shows which Python executables are found in PATH.

---

### Show available Python versions via launcher

```powershell
py --list
```

**What it does:**  
Shows all Python versions registered with the Windows launcher.

---

### Show current user groups

```powershell
whoami /groups
```

**What it does:**  
Displays security groups for your current Windows account.

---

### List installed packages with winget

```powershell
winget list python
```

**What it does:**  
Shows installed Python packages managed by winget.

---

## 26) Secret handling best practices for GitHub

Never commit files like:

- `serviceAccountKey.json`
- `.env`
- API keys
- Firebase admin credentials
- cloud service credentials

Instead use:

- `.gitignore`
- GitHub Actions Secrets
- environment variables on Render / Cloud Run / Railway / Vercel / Netlify
- secret managers

---

## 27) Suggested normal workflow for your project

### First push

```bash
cd "D:\Zootopia Club AI"
git init
git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

---

### Daily workflow

```bash
git status
git add .
git commit -m "Describe your changes"
git push
```

---

### Pull latest updates before working

```bash
git pull
```

---

### Create feature branch

```bash
git checkout -b feature/my-new-feature
```

---

### Merge later

```bash
git checkout main
git pull
git merge feature/my-new-feature
git push
```

---

## 28) Commands specifically mentioned in this chat

These commands were explicitly used or discussed in the conversation:

```bash
git --version
git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"
git config --global --list
git init
git status
git add .
git add package.json
git add package.json package-lock.json
git commit -m "Initial commit"
git commit --amend --no-edit
git commit --amend -m "Fix secret removal and update gitignore"
git branch -M main
git branch
git branch -a
git branch -r
git checkout main
git checkout -b new-branch
git checkout -b local-pr origin/copilot/fix-login-behavior-and-session-flow
git switch -c feature-x
git clone https://github.com/USERNAME/REPO.git
git clone git@github.com:USERNAME/REPO.git
git remote add origin https://github.com/USERNAME/REPO.git
git remote -v
git remote remove origin
git remote set-url origin https://github.com/USERNAME/REPO.git
git push -u origin main
git push
git push --force
git push --force-with-lease
git pull
git pull origin main
git fetch
git fetch origin
git log --oneline
git log --oneline --decorate --graph --all
git log --oneline --decorate --graph --all -20
git log --stat -- serviceAccountKey.json
git rm --cached serviceAccountKey.json
git restore --staged package.json
git restore package.json
git reset --hard
git reset --hard COMMIT_HASH
git stash
git stash push -m "WIP admin loading fix"
git stash list
git stash pop
git stash apply
git diff
git diff --staged
git diff COMMIT1 COMMIT2
git diff main..HEAD
git merge feature-x
git rebase main
git rebase --continue
git rebase --abort
git tag v1.0.0
git tag -a v1.0.0 -m "First release"
git push origin --tags
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch serviceAccountKey.json" --prune-empty --tag-name-filter cat -- --all
git filter-repo --path serviceAccountKey.json --invert-paths
ssh-keygen -t ed25519 -C "your_email@example.com"
ssh -T git@github.com
where python
py --list
whoami /groups
winget list python
```

---

## 29) Suggested `.gitignore` for your project

```gitignore
# Node
node_modules/
dist/
build/
coverage/

# Python
.venv/
venv/
__pycache__/
*.pyc

# Environment
.env
.env.*
serviceAccountKey.json
**/serviceAccountKey.json

# Editors
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
```

---

## 30) Very short cheat sheet

### Setup
```bash
git init
git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"
```

### Save work
```bash
git status
git add .
git commit -m "Your message"
```

### Connect GitHub
```bash
git remote add origin https://github.com/USERNAME/REPO.git
git branch -M main
git push -u origin main
```

### Daily work
```bash
git pull
git add .
git commit -m "Update"
git push
```

### Branches
```bash
git checkout -b feature-x
git checkout main
git merge feature-x
```

### Fix secret mistake
```bash
git rm --cached serviceAccountKey.json
git commit --amend --no-edit
```

### Sync merged PR
```bash
git checkout main
git pull origin main
```

---

End of guide.
