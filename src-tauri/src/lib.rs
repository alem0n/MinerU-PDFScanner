mod migration; // 引入 migration 模块
use std::path::PathBuf;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::time::{SystemTime, UNIX_EPOCH};

/// 获取数据库目录：用户目录下的 MinerU-PDFScanner
fn get_db_dir() -> PathBuf {
    let home = dirs::home_dir().expect("无法获取用户主目录");
    home.join("MinerU-PDFScanner")
}

/// 获取数据库文件完整路径
fn db_file_path() -> PathBuf {
    get_db_dir().join("database.db")
}

#[tauri::command]
fn get_db_path() -> String {
    db_file_path().to_string_lossy().to_string()
}

/// 生成唯一临时目录名
fn temp_dir_name() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!(".tmp_{}", ts)
}

/// 将 ZIP 解压到临时目录 → 校验结构 → 展平引擎层 → 重命名输出目录 → 移动到目标位置
///
/// 预期 ZIP 内部结构：{fileName}/{engineName}/实际内容
/// 最终输出：{targetDir}/{outputDirName}/实际内容
#[tauri::command]
fn unzip_file(zip_path: String, target_dir: String, output_dir_name: String) -> Result<Vec<String>, String> {
    let zip_path = PathBuf::from(&zip_path);
    let target_dir = PathBuf::from(&target_dir);

    // 确保目标目录存在
    fs::create_dir_all(&target_dir).map_err(|e| format!("无法创建目标目录: {}", e))?;

    // 第 1 步：解压到临时目录
    let tmp_dir = target_dir.join(temp_dir_name());
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("无法创建临时目录: {}", e))?;

    let _extracted_files = extract_zip(&zip_path, &tmp_dir)?;

    // 第 2 步：校验结构并展平
    flatten_engine_dir(&tmp_dir)?;

    // 第 3 步：重命名根目录为 output_dir_name
    let root_dir = find_single_root(&tmp_dir)?; // {tmp_dir}/{fileName}
    let renamed = tmp_dir.join(&output_dir_name);
    fs::rename(&root_dir, &renamed).map_err(|e| format!("无法重命名目录: {}", e))?;

    // 第 4 步：移到目标目录
    let final_path = target_dir.join(&output_dir_name);
    if final_path.exists() {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let backup = target_dir.join(format!("{}.bak_{}", output_dir_name, ts));
        fs::rename(&final_path, &backup).map_err(|e| format!("无法备份已有目录: {}", e))?;
    }
    fs::rename(&renamed, &final_path).map_err(|e| format!("无法移动到目标目录: {}", e))?;

    // 第 5 步：清理临时目录和 ZIP
    let _ = fs::remove_dir_all(&tmp_dir);
    let _ = fs::remove_file(&zip_path);

    // 返回最终文件列表
    Ok(list_files_recursive(&final_path))
}

/// 解压 ZIP 中所有文件到指定目录
fn extract_zip(zip_path: &PathBuf, out_dir: &PathBuf) -> Result<Vec<String>, String> {
    let file = File::open(zip_path).map_err(|e| format!("无法打开 ZIP 文件: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("无法读取 ZIP 文件: {}", e))?;

    let mut files = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("无法读取 ZIP 条目 {}: {}", i, e))?;
        let entry_name = entry.name().to_string();

        if entry.is_dir() {
            continue;
        }

        let out_path = out_dir.join(&entry_name);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("无法创建子目录: {}", e))?;
        }

        let mut data = Vec::new();
        entry.read_to_end(&mut data).map_err(|e| format!("无法读取条目 {}: {}", entry_name, e))?;

        let mut out_file = File::create(&out_path).map_err(|e| format!("无法创建文件 {}: {}", entry_name, e))?;
        out_file.write_all(&data).map_err(|e| format!("无法写入文件 {}: {}", entry_name, e))?;

        files.push(out_path.to_string_lossy().to_string());
    }
    Ok(files)
}

/// 查找临时目录下唯一的根目录
fn find_single_root(dir: &PathBuf) -> Result<PathBuf, String> {
    let entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("无法读取目录: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .collect();

    if entries.is_empty() {
        return Err("ZIP 结构异常：根层未找到任何目录".into());
    }
    if entries.len() > 1 {
        return Err(format!(
            "ZIP 结构异常：根层预期 1 个目录，实际 {} 个",
            entries.len()
        ));
    }
    Ok(entries.into_iter().next().unwrap().path())
}

/// 校验并展平 {root}/{engine} → {root}，消除引擎中间层
fn flatten_engine_dir(tmp_dir: &PathBuf) -> Result<(), String> {
    let root_dir = find_single_root(tmp_dir)?; // {tmp_dir}/{fileName}

    let sub_entries: Vec<_> = fs::read_dir(&root_dir)
        .map_err(|e| format!("无法读取根目录: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .collect();

    if sub_entries.len() != 1 {
        return Err(format!(
            "ZIP 结构异常：预期 {{fileName}} 下有 1 个引擎目录，实际 {} 个",
            sub_entries.len()
        ));
    }

    let engine_dir = sub_entries.into_iter().next().unwrap().path(); // {tmp_dir}/{fileName}/{engine}

    // 检查引擎目录是否有内容
    let content_entries: Vec<_> = fs::read_dir(&engine_dir)
        .map_err(|e| format!("无法读取引擎目录: {}", e))?
        .filter_map(|e| e.ok())
        .collect();

    if content_entries.is_empty() {
        return Err("ZIP 结构异常：引擎目录下无内容".into());
    }

    // 将引擎目录下的所有内容上移到根目录
    for entry in &content_entries {
        let src = entry.path();
        let dst = root_dir.join(
            entry.file_name()
        );
        fs::rename(&src, &dst).or_else(|_| {
            // 跨挂载点 fallback：copy + remove
            copy_dir(&src, &dst)?;
            remove_dir_all(&src)
        }).map_err(|e| format!("无法移动文件 {}: {}", entry.file_name().to_string_lossy(), e))?;
    }

    // 删除引擎目录
    fs::remove_dir(&engine_dir).map_err(|e| format!("无法删除引擎目录: {}", e))?;

    Ok(())
}

/// 拷贝目录或文件到目标路径
fn copy_dir(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| format!("无法创建目录: {}", e))?;
        for entry in fs::read_dir(src).map_err(|e| format!("无法读取目录: {}", e))? {
            let entry = entry.map_err(|e| format!("无法读取条目: {}", e))?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());
            copy_dir(&src_path, &dst_path)?;
        }
    } else {
        fs::copy(src, dst).map_err(|e| format!("无法复制文件: {}", e))?;
    }
    Ok(())
}

/// 递归删除目录
fn remove_dir_all(path: &PathBuf) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("无法删除目录: {}", e))
    } else {
        fs::remove_file(path).map_err(|e| format!("无法删除文件: {}", e))
    }
}

/// 递归获取目录下所有文件路径
fn list_files_recursive(dir: &PathBuf) -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files.extend(list_files_recursive(&path));
            } else {
                files.push(path.to_string_lossy().to_string());
            }
        }
    }
    files
}

/// 将 source_dir 目录下的所有文件递归打包为 ZIP 文件，保存到 output_path
#[tauri::command]
fn zip_folder(source_dir: String, output_path: String) -> Result<String, String> {
    let source_dir = PathBuf::from(&source_dir);
    let output_path = PathBuf::from(&output_path);

    // 确保源目录存在
    if !source_dir.exists() {
        return Err(format!("源目录不存在: {}", source_dir.display()));
    }
    if !source_dir.is_dir() {
        return Err(format!("源路径不是目录: {}", source_dir.display()));
    }

    // 创建输出文件所在的父目录
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建输出目录: {}", e))?;
    }

    let file = File::create(&output_path).map_err(|e| format!("无法创建ZIP文件: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);

    let options = zip::write::FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // 递归收集所有文件并写入 ZIP
    zip_recursive(&mut zip, &source_dir, &source_dir, &options)?;

    zip.finish().map_err(|e| format!("无法完成ZIP打包: {}", e))?;

    println!("[zip_folder] 打包完成: {} -> {}", source_dir.display(), output_path.display());
    Ok(output_path.to_string_lossy().to_string())
}

/// 递归遍历目录，将所有文件添加到 ZIP 归档中
fn zip_recursive(
    zip: &mut zip::ZipWriter<std::fs::File>,
    base_dir: &PathBuf,
    current_dir: &PathBuf,
    options: &zip::write::FileOptions<()>,
) -> Result<(), String> {
    let entries = fs::read_dir(current_dir).map_err(|e| format!("无法读取目录: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        // 跳过临时文件
        if let Some(name) = path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.') {
                continue;
            }
        }

        let relative = path
            .strip_prefix(base_dir)
            .map_err(|e| format!("路径错误: {}", e))?
            .to_string_lossy()
            .to_string()
            .replace('\\', "/"); // 统一为 / 分隔符

        if path.is_dir() {
            // 添加目录条目（末尾加 /）
            zip.add_directory(&format!("{}/", relative), *options)
                .map_err(|e| format!("无法添加目录: {}", e))?;
            zip_recursive(zip, base_dir, &path, options)?;
        } else {
            zip.start_file(&relative, *options)
                .map_err(|e| format!("无法添加文件 {}: {}", relative, e))?;
            let mut f = File::open(&path).map_err(|e| format!("无法打开文件 {}: {}", relative, e))?;
            let mut buffer = Vec::new();
            f.read_to_end(&mut buffer)
                .map_err(|e| format!("无法读取文件 {}: {}", relative, e))?;
            zip.write_all(&buffer)
                .map_err(|e| format!("无法写入ZIP条目 {}: {}", relative, e))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 在用户目录下创建 MinerU-PDFScanner 文件夹（跨平台）
    let db_dir = get_db_dir();
    std::fs::create_dir_all(&db_dir).expect("无法创建数据库目录");

    let db_path = db_file_path();
    let db_uri = format!("sqlite:{}", db_path.to_string_lossy());

    let migrations = migration::load_migrations();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&db_uri, migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet, get_db_path, unzip_file, zip_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
