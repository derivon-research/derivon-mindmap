{
  description = "derivon-mindmap development shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            pkg-config
            gobject-introspection
            nodejs_22
            cargo
            rustc
            clippy
            rustfmt
            # scripts/ci/smoke-linux-app.sh launches the desktop binary headless.
            xvfb-run
            dbus
          ];

          buildInputs = with pkgs; [
            at-spi2-atk
            atkmm
            cairo
            gdk-pixbuf
            glib
            glib-networking
            gtk3
            harfbuzz
            librsvg
            libsoup_3
            openssl
            pango
            webkitgtk_4_1
          ];

          # WebKitGTK needs glib-networking for TLS, and its DMA-BUF renderer
          # fails under Xvfb and on hosts without a matching GPU driver.
          GIO_MODULE_DIR = "${pkgs.glib-networking}/lib/gio/modules/";
          WEBKIT_DISABLE_DMABUF_RENDERER = "1";
        };
      });
    };
}
