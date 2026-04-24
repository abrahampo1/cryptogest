const { execSync } = require("child_process");
const path = require("path");

exports.default = async function (context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log("Ad-hoc signing:", appPath);
  execSync(
    `codesign --sign - --force --deep --entitlements "${path.join(__dirname, "..", "build", "entitlements.mac.plist")}" "${appPath}"`,
    { stdio: "inherit" }
  );
  console.log("Ad-hoc signing complete");
};
