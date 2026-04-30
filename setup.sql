-- NovaMeet Database Schema Setup

-- 1. Meetings Table
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_code TEXT UNIQUE NOT NULL,
    title TEXT DEFAULT 'NovaMeet Meeting',
    status TEXT DEFAULT 'active', -- 'active', 'ended'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE
);

-- 2. Meeting Participants Table
CREATE TABLE IF NOT EXISTS meeting_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    socket_id TEXT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE
);

-- 3. Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    message JSONB NOT NULL, -- Stores {text, time}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Speaking Stats Table
CREATE TABLE IF NOT EXISTS speaking_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    participant_name TEXT NOT NULL,
    total_seconds INTEGER DEFAULT 0,
    percentage DECIMAL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
-- For a real production app, you'd add specific policies. 
-- For now, we'll assume the keys used have bypass RLS or basic authenticated access.

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_stats ENABLE ROW LEVEL SECURITY;

-- Create Policies (Allow all for development, restrict for production)
CREATE POLICY "Public read for meetings" ON meetings FOR SELECT USING (true);
CREATE POLICY "Public insert for meetings" ON meetings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update for meetings" ON meetings FOR UPDATE USING (true);

CREATE POLICY "Public read for participants" ON meeting_participants FOR SELECT USING (true);
CREATE POLICY "Public insert for participants" ON meeting_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update for participants" ON meeting_participants FOR UPDATE USING (true);

CREATE POLICY "Public read for chats" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Public insert for chats" ON chat_messages FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read for stats" ON speaking_stats FOR SELECT USING (true);
CREATE POLICY "Public insert for stats" ON speaking_stats FOR INSERT WITH CHECK (true);
