fn copy_files(name, base, files) {
  let is_windows = variable::get("os-arch").starts_with("windows");
  let script = [];
  for file in files {
    let source = `${base}/${file}`;
    if is_windows {
      script.push(`New-Item -ItemType Directory -Force -Path (Split-Path -Parent '${file}') | Out-Null`);
      script.push(`Copy-Item '${source}' '${file}'`);
    } else {
      script.push(`mkdir -p $(dirname "${file}") && cp -p "${source}" "${file}"`);
    }
  }

  if is_windows {
    let script_file = `${name}.ps1`;
    file::write(script_file, script);
    system::command("powershell", ["-File", script_file]);
    file::delete(script_file);
  } else {
    let script_file = `${name}.sh`;
    file::write(script_file, script);
    system::command("sh", ["-e", script_file]);
    file::delete(script_file);
  }
}
