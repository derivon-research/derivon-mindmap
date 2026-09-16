//! The base skills the bundle ships, and the one rule for putting them in place.
//!
//! `derivon-research/skills` at a pinned revision is prepared into `dist-skills/` by
//! `scripts/prepare-skills-seed.mjs` and shipped as a Tauri resource. On the first use that
//! creates `~/.derivon`, the skills in that seed which are **not already there** are copied into
//! `<root>/skills/`. Nothing is ever overwritten, and nothing is ever deleted.
//!
//! The rule is the whole point rather than a detail: the skills root belongs to the operator, the
//! same way the extensions root does, so whatever is in it — whoever put it there, and whether or
//! not the application thinks it is current — is what a session uses. See
//! `docs/adr/0013-who-owns-the-user-level-skills-root.md`.

use std::path::{Path, PathBuf};

/// What the seed's own `manifest.json` records about the revision it was built from.
///
/// Written by the prepare step, never by hand. `surface_version` is what the seeded surface
/// declared about itself when the seed was prepared, or `None` when it declared nothing — the
/// application then reports no version difference, because "unknown" is not "different".
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
// The manifest is written by the prepare step, in the same camelCase the protocol uses.
#[serde(rename_all = "camelCase")]
pub struct SeedManifest {
    pub repository: String,
    pub revision: String,
    #[serde(default)]
    pub surface_version: Option<String>,
    #[serde(default)]
    pub digest: Option<String>,
    pub skills: Vec<String>,
}

/// The seed's manifest, or nothing when there is no seed to read.
///
/// An absence is not an error: a development build may never have run the prepare step, and a
/// session without these skills is still a usable session.
pub fn read_manifest(path: &Path) -> Option<SeedManifest> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Put the seed's skills in place, and only the ones that are not there.
///
/// Returns what could not be done, as lines for the operator. An empty list means every skill was
/// either already installed or copied; a failed copy is a diagnostic and never a refusal, because
/// the session that follows is still usable without it.
pub fn install_absent(seed: &Path, skills_root: &Path, manifest: &SeedManifest) -> Vec<String> {
    let mut notes = Vec::new();
    for name in &manifest.skills {
        // The manifest is bundle data, not user input, but it names directories this function
        // creates, so each name is checked to be one path segment before it is used. A name that
        // walked upwards would put a skill outside the root it belongs to.
        if !is_one_segment(name) {
            notes.push(format!("技能种子里的名字不是一个目录名，已跳过：{name}"));
            continue;
        }
        let target = skills_root.join(name);
        if target.exists() {
            // The operator's, or an earlier run's. Either way it is what a session will use, and
            // this application does not decide it is stale.
            continue;
        }
        let source = seed.join(name);
        if !source.is_dir() {
            notes.push(format!("随包的技能种子缺少 {name}，未安装；应用可能需要重新构建。"));
            continue;
        }
        if let Err(error) = copy_directory(&source, &target) {
            notes.push(format!("无法安装基础技能 {name}：{error}"));
        }
    }
    notes
}

/// The seed directory and its manifest beside a resource directory, if both are there.
pub fn seed_in(resource_dir: &Path) -> Option<(PathBuf, SeedManifest)> {
    let directory = resource_dir.join("skills-seed");
    let manifest = read_manifest(&directory.join("manifest.json"))?;
    Some((directory, manifest))
}

/// One path segment: no separator, no parent, nothing empty.
fn is_one_segment(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\')
}

/// Copy a directory tree.
///
/// `std::fs::copy` carries the permission bits on Unix, so a skill's scripts stay executable —
/// which matters to the skill's own documentation even though the companion runs them through the
/// bundled Node runtime rather than by their shebang.
fn copy_directory(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to)
        .map_err(|error| format!("could not create {}: {error}", to.display()))?;
    let entries = std::fs::read_dir(from)
        .map_err(|error| format!("could not read {}: {error}", from.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("could not read {}: {error}", from.display()))?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        let kind = entry
            .file_type()
            .map_err(|error| format!("could not read {}: {error}", source.display()))?;
        if kind.is_dir() {
            copy_directory(&source, &target)?;
        } else {
            std::fs::copy(&source, &target)
                .map_err(|error| format!("could not copy {}: {error}", source.display()))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(skills: &[&str]) -> SeedManifest {
        SeedManifest {
            repository: "derivon-research/skills".to_owned(),
            revision: "8466baad58c7f325fcfdb32874d8187d151481c8".to_owned(),
            surface_version: None,
            digest: None,
            skills: skills.iter().map(|name| (*name).to_owned()).collect(),
        }
    }

    fn seed_with(name: &str, body: &str) -> tempfile::TempDir {
        let seed = tempfile::tempdir().unwrap();
        let scripts = seed.path().join(name).join("scripts");
        std::fs::create_dir_all(&scripts).unwrap();
        std::fs::write(scripts.join("derivon-workspace.mjs"), body).unwrap();
        seed
    }

    #[test]
    fn installs_a_skill_that_is_not_there() {
        let seed = seed_with("derivon-mindmap", "the surface");
        let root = tempfile::tempdir().unwrap();

        let notes = install_absent(seed.path(), root.path(), &manifest(&["derivon-mindmap"]));

        assert!(notes.is_empty(), "{notes:?}");
        let installed = root.path().join("derivon-mindmap/scripts/derivon-workspace.mjs");
        assert_eq!(std::fs::read_to_string(installed).unwrap(), "the surface");
    }

    #[test]
    fn leaves_a_skill_that_is_already_there_exactly_as_it_is() {
        let seed = seed_with("derivon-mindmap", "the surface the application ships");
        let root = tempfile::tempdir().unwrap();
        let existing = root.path().join("derivon-mindmap");
        std::fs::create_dir_all(&existing).unwrap();
        std::fs::write(existing.join("SKILL.md"), "the operator's own").unwrap();

        let notes = install_absent(seed.path(), root.path(), &manifest(&["derivon-mindmap"]));

        assert!(notes.is_empty(), "{notes:?}");
        // Nothing was added and nothing was replaced: not even a file the seed also carries.
        assert_eq!(std::fs::read_to_string(existing.join("SKILL.md")).unwrap(), "the operator's own");
        assert!(!existing.join("scripts").exists());
    }

    #[test]
    fn reports_a_skill_the_seed_does_not_carry_without_failing() {
        let seed = seed_with("derivon-mindmap", "the surface");
        let root = tempfile::tempdir().unwrap();

        let notes = install_absent(seed.path(), root.path(), &manifest(&["derivon-mindmap", "derivon-cli"]));

        assert_eq!(notes.len(), 1);
        assert!(notes[0].contains("derivon-cli"), "{notes:?}");
        // The skill that was there still landed: one missing skill does not stop the others.
        assert!(root.path().join("derivon-mindmap").is_dir());
    }

    #[test]
    fn refuses_a_manifest_name_that_would_leave_the_skills_root() {
        let seed = seed_with("derivon-mindmap", "the surface");
        let root = tempfile::tempdir().unwrap();

        let notes = install_absent(seed.path(), root.path(), &manifest(&["../escaped"]));

        assert_eq!(notes.len(), 1);
        assert!(notes[0].contains("../escaped"), "{notes:?}");
        assert!(!root.path().parent().unwrap().join("escaped").exists());
    }

    #[test]
    fn copies_nested_directories() {
        let seed = tempfile::tempdir().unwrap();
        let nested = seed.path().join("derivon-mindmap/scripts/lib");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("envelope.mjs"), "envelope").unwrap();
        let root = tempfile::tempdir().unwrap();

        install_absent(seed.path(), root.path(), &manifest(&["derivon-mindmap"]));

        assert_eq!(
            std::fs::read_to_string(root.path().join("derivon-mindmap/scripts/lib/envelope.mjs")).unwrap(),
            "envelope"
        );
    }

    #[test]
    fn reads_the_manifest_the_prepare_step_writes() {
        let directory = tempfile::tempdir().unwrap();
        let manifest_path = directory.path().join("manifest.json");
        std::fs::write(&manifest_path, r#"{
            "repository": "derivon-research/skills",
            "revision": "8466baad58c7f325fcfdb32874d8187d151481c8",
            "surfaceVersion": "0.3.0",
            "digest": "abc",
            "skills": ["derivon-mindmap", "derivon-cli"]
        }"#).unwrap();

        let manifest = read_manifest(&manifest_path).unwrap();

        assert_eq!(manifest.surface_version.as_deref(), Some("0.3.0"));
        assert_eq!(manifest.skills, vec!["derivon-mindmap", "derivon-cli"]);
    }

    #[test]
    fn says_nothing_about_a_seed_that_is_not_there() {
        let directory = tempfile::tempdir().unwrap();
        assert!(read_manifest(&directory.path().join("manifest.json")).is_none());
        assert!(seed_in(directory.path()).is_none());
    }

    #[test]
    fn says_nothing_about_a_seed_that_cannot_be_read() {
        // A bundle whose seed was corrupted is the same situation as one without a seed: there is
        // nothing to install from, and a session without these skills is still usable.
        let directory = tempfile::tempdir().unwrap();
        let seed = directory.path().join("skills-seed");
        std::fs::create_dir_all(&seed).unwrap();
        std::fs::write(seed.join("manifest.json"), "not json").unwrap();

        assert!(seed_in(directory.path()).is_none());
    }
}
