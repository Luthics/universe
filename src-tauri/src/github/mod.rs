use crate::binary_resolver::{VersionAsset, VersionDownloadInfo};
use anyhow::anyhow;
use log::info;
use reqwest::Client;
use serde::Deserialize;

const LOG_TARGET: &str = "tari::universe::github";

#[derive(Deserialize)]
struct Release {
    name: String,
    draft: bool,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

pub async fn list_releases(
    repo_owner: &str,
    repo_name: &str,
) -> Result<Vec<VersionDownloadInfo>, anyhow::Error> {
    let client = Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/{}/releases",
        repo_owner, repo_name
    );

    let response = client
        .get(&url)
        .header("User-Agent", "request")
        .send()
        .await?;
    if response.status() != 200 {
        return Err(anyhow!("Failed to fetch releases: {}", response.status()));
    }
    let data = response.text().await?;
    let releases: Vec<Release> = serde_json::from_str(&data)?;

    info!(target: LOG_TARGET, "Releases for {}/{}:", repo_owner, repo_name);
    let mut res = vec![];
    for release in releases {
        if release.draft {
            continue;
        }

        if release.name.contains(".old") {
            continue;
        }
        // Remove any v prefix
        let name = release.name.trim_start_matches('v').to_string();
        info!(target: LOG_TARGET, " - release: {}", name);
        // res.push(semver::Version::parse(&tag_name)?);
        let mut assets = vec![];
        for asset in release.assets {
            assets.push(VersionAsset {
                url: asset.browser_download_url,
                name: asset.name,
            });
        }
        match semver::Version::parse(&name) {
            Ok(v) => {
                res.push(VersionDownloadInfo { version: v, assets });
            }
            Err(e) => {
                info!(target: LOG_TARGET, "Failed to parse version: {}", e);
                continue;
            }
        }
    }

    Ok(res)
}
