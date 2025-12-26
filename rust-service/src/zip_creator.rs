use anyhow::Result;
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// Create a zip file from a list of file paths and their contents
pub fn create_zip(files: &[(String, Vec<u8>)]) -> Result<Vec<u8>> {
    let buffer = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buffer);

    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for (path, content) in files {
        zip.start_file(path, options)?;
        zip.write_all(content)?;
    }

    let result = zip.finish()?;
    Ok(result.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_zip() {
        let files = vec![
            ("test.txt".to_string(), b"Hello, World!".to_vec()),
            ("src/main.rs".to_string(), b"fn main() {}".to_vec()),
        ];

        let zip_data = create_zip(&files).unwrap();
        assert!(!zip_data.is_empty());
    }
}
