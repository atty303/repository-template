let license = variable::get("license").to_upper();
switch license {
  "MIT" => {
    file::rename("LICENSE-MIT", "LICENSE");
  }
}
