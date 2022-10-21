// SPDX-License-Identifier: MIT

pragma solidity^0.8.0;


contract ShardingTable {
    event PeerObjCreated(string peerId, uint8 ask, uint32 stake);
    event PeerRemoved(string peerId);
    event PeerParamsUpdated(string peerId, uint8 ask, uint32 stake);

    struct Peer {
        string prevPeer;
        string nextPeer;
        string id;
        uint8 ask;
        uint32 stake;
    }

    string private emptyPointer;
    string public head;
    string public tail;
    uint16 public peerCount;

    mapping(string => Peer) peers;

    constructor() {
        emptyPointer = "";
        head = emptyPointer;
        tail = emptyPointer;
        peerCount = 0;
    }

    function getPeer(string calldata peerId)
        external
        view
        returns (string memory, uint8, uint32)
    {
        Peer memory peer = peers[peerId];

        return (peer.id, peer.ask, peer.stake);
    }

    function getShardingTable(string memory startingPeerId, uint16 nodesNumber)
        public
        view
        returns (Peer[] memory)
    {
        require(nodesNumber >= 0, "Nodes number must be non-negative!");

        Peer[] memory peersPage;

        if (nodesNumber == 0) {
            return peersPage;
        }

        peersPage = new Peer[](nodesNumber);

        peersPage[0] = peers[startingPeerId];
        uint16 i = 1;

        while (i < nodesNumber && !_equalIds(peersPage[i-1].nextPeer, emptyPointer)) {
            peersPage[i] = peers[peersPage[i-1].nextPeer];
            i += 1;
        }
        return peersPage;
    }

    function getShardingTable()
        public
        view
        returns (Peer[] memory)
    {
        return getShardingTable(head, peerCount);
    }

    function pushBack(string memory peerId, uint8 ask, uint32 stake)
        public
    {
        _createPeer(peerId, ask, stake);

        if (!_equalIds(tail, emptyPointer)) _link(tail, peerId);
        _setTail(peerId);

        if (_equalIds(head, emptyPointer)) _setHead(peerId);

        peerCount += 1;
    }

    function pushFront(string memory peerId, uint8 ask, uint32 stake)
        public
    {
        _createPeer(peerId, ask, stake);

        if (!_equalIds(head, emptyPointer)) _link(peerId, head);
        _setHead(peerId);

        if (_equalIds(tail, emptyPointer)) _setTail(peerId);

        peerCount += 1;
    }

    function removePeer(string memory peerId)
        public
    {
        Peer memory removedPeer = peers[peerId];

        if (_equalIds(head, peerId) && _equalIds(tail, peerId)) {
            _setHead(emptyPointer);
            _setTail(emptyPointer);
        }
        else if (_equalIds(head, peerId)) {
            _setHead(removedPeer.nextPeer);
            peers[head].prevPeer = emptyPointer;
        }
        else if (_equalIds(tail, peerId)) {
            _setTail(removedPeer.prevPeer);
            peers[tail].nextPeer = emptyPointer;
        }
        else {
            _link(removedPeer.prevPeer, removedPeer.nextPeer);
        }

        delete peers[peerId];

        peerCount -= 1;
    
        emit PeerRemoved(peerId);
    }

    function updateParams(string memory peerId, uint8 newAsk, uint32 newStake)
        external
    {
        Peer storage peer = peers[peerId];

        peer.ask = newAsk;
        peer.stake = newStake;

        emit PeerParamsUpdated(peerId, peer.ask, peer.stake);
    }

    function _createPeer(string memory peerId, uint8 ask, uint32 stake)
        internal
    {
        Peer memory newPeer = Peer(
            emptyPointer,
            emptyPointer,
            peerId,
            ask,
            stake
        );

        peers[peerId] = newPeer;

        emit PeerObjCreated(peerId, ask, stake);
    }

    function _setHead(string memory peerId)
        internal
    {
        head = peerId;
    }

    function _setTail(string memory peerId)
        internal
    {
        tail = peerId;
    }

    function _link(string memory _leftPeerId, string memory _rightPeerId)
        internal
    {
        peers[_leftPeerId].nextPeer = _rightPeerId;
        peers[_rightPeerId].prevPeer = _leftPeerId;
    }

    function _equalIds(string memory _firstId, string memory _secondId)
        internal
        pure
        returns (bool)
    {
        return keccak256(bytes(_firstId)) == keccak256(bytes(_secondId));
    }
}
