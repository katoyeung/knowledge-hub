#!/bin/bash
# version.sh

# Get the current version
CURRENT_VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
echo "Current version: $CURRENT_VERSION"

# Parse version numbers
IFS='.' read -r -a VERSION_PARTS <<< "${CURRENT_VERSION#v}"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]}"

# Function to create new version
create_version() {
    local type=$1
    local message=$2
    
    case $type in
        "major")
            NEW_VERSION="v$((MAJOR + 1)).0.0"
            ;;
        "minor")
            NEW_VERSION="v${MAJOR}.$((MINOR + 1)).0"
            ;;
        "patch")
            NEW_VERSION="v${MAJOR}.${MINOR}.$((PATCH + 1))"
            ;;
        *)
            echo "Invalid version type. Use major, minor, or patch"
            exit 1
            ;;
    esac
    
    # Create annotated tag
    git tag -a "$NEW_VERSION" -m "$message"
    
    # Push tag
    git push origin "$NEW_VERSION"
    
    echo "Created new version: $NEW_VERSION"
}

# Example usage:
# ./version.sh major "Major release with new features"
# ./version.sh minor "Added new authentication system"
# ./version.sh patch "Fixed login bug"