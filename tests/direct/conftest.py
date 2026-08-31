"""Shared helpers for direct mode tests."""


def to_hex(addr_bytes):
    """Convert address bytes to checksummed hex matching contract output.

    The contract's get_bets()/get_points() return keys via Address.as_hex,
    which produces EIP-55 checksummed hex. Call after direct_deploy so the
    SDK is on sys.path.
    """
    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes.as_hex
    from genlayer.py.types import Address

    return Address(addr_bytes).as_hex


def to_address(hex_str):
    """Build an Address from a hex string. Call after direct_deploy so the
    SDK is on sys.path — real GenVM calldata decoding delivers Address-typed
    write/view arguments as Address instances, not plain strings, so direct
    mode tests must construct them explicitly to match."""
    from genlayer.py.types import Address

    return Address(hex_str)
