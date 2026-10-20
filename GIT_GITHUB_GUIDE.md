# Git & GitHub - Inventory Management System

This file is the Git/GitHub part of the project.

## Git Basics

### Initialize repository
```bash
git init
```

### Check files changed
```bash
git status
```

### Add all project files
```bash
git add .
```

### Commit changes
```bash
git commit -m "Add inventory management system"
```

## GitHub Repository

1. Open GitHub.
2. Create a new repository named:
   `Inventory-Management-System`
3. Keep the repository empty when creating it.
4. Copy the repository URL.
5. Run:

```bash
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git branch -M main
git push -u origin main
```

## Push After Future Changes

```bash
git add .
git commit -m "Update inventory system"
git push
```

## Pull Changes

If the GitHub repository has newer changes:

```bash
git pull origin main
```

## Useful Commands

```bash
git status
git log --oneline
git remote -v
git branch
git branch -M main
```

## What This Demonstrates

- Git repository initialization
- Tracking project files
- Commit
- Push
- Pull
- GitHub remote repository
