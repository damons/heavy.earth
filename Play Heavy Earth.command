#!/bin/zsh
cd -- "${0:A:h}"
cargo run --release -- --open
