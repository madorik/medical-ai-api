const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { supabase } = require('./supabase-config');

// 사용자 정보를 세션에 저장하는 함수
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// 세션에서 사용자 정보를 가져오는 함수
passport.deserializeUser(async (id, done) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('사용자 조회 오류:', error);
      return done(error, null);
    }
    
    done(null, user);
  } catch (error) {
    console.error('deserializeUser 오류:', error);
    done(error, null);
  }
});

// Google OAuth 2.0 Strategy 설정
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || 'demo-client-id',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'demo-client-secret',
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // 기존 사용자 찾기 (소셜 ID와 제공자로 검색)
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('social_id', profile.id)
      .eq('social_provider', 'google')
      .single();
    
    if (selectError && selectError.code !== 'PGRST116') {
      console.error('사용자 조회 오류:', selectError);
      return done(selectError, null);
    }
    
    if (existingUser) {
      // 기존 사용자 - 정보 업데이트
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          name: profile.displayName,
          first_name: profile.name.givenName,
          last_name: profile.name.familyName,
          profile_image: profile.photos[0]?.value,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingUser.id)
        .select()
        .single();
      
      if (updateError) {
        console.error('사용자 업데이트 오류:', updateError);
        return done(updateError, null);
      }
      
      console.log('기존 사용자 로그인:', updatedUser.email);
      return done(null, updatedUser);
    }
    
    // 새 사용자 생성
    const newUser = {
      social_id: profile.id,
      social_provider: 'google',
      email: profile.emails[0].value,
      name: profile.displayName,
      first_name: profile.name.givenName,
      last_name: profile.name.familyName,
      profile_image: profile.photos[0]?.value
    };
    
    const { data: createdUser, error: insertError } = await supabase
      .from('users')
      .insert([newUser])
      .select()
      .single();
    
    if (insertError) {
      console.error('사용자 생성 오류:', insertError);
      return done(insertError, null);
    }
    
    console.log('새 사용자 생성:', createdUser.email, '(소셜 제공자: google)');
    return done(null, createdUser);
    
  } catch (error) {
    console.error('Google OAuth 처리 중 오류:', error);
    return done(error, null);
  }
}));

/**
 * 모든 사용자 조회 (관리자용)
 */
async function getAllUsers() {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('사용자 목록 조회 오류:', error);
      return [];
    }
    
    return users;
  } catch (error) {
    console.error('getAllUsers 오류:', error);
    return [];
  }
}

/**
 * ID로 사용자 조회
 */
async function getUserById(id) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('사용자 조회 오류:', error);
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('getUserById 오류:', error);
    return null;
  }
}

/**
 * 소셜 ID로 사용자 조회
 */
async function getUserBySocialId(socialId, provider = 'google') {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('social_id', socialId)
      .eq('social_provider', provider)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('사용자 조회 오류:', error);
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('getUserBySocialId 오류:', error);
    return null;
  }
}

/**
 * 이메일로 사용자 조회
 */
async function getUserByEmail(email) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('사용자 조회 오류:', error);
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('getUserByEmail 오류:', error);
    return null;
  }
}

/**
 * 소셜 제공자별 사용자 통계
 */
async function getUserStatsByProvider() {
  try {
    const { data: stats, error } = await supabase
      .from('users')
      .select('social_provider')
      .then(result => {
        if (result.error) throw result.error;
        
        const providerCounts = result.data.reduce((acc, user) => {
          acc[user.social_provider] = (acc[user.social_provider] || 0) + 1;
          return acc;
        }, {});
        
        return { data: providerCounts, error: null };
      });
    
    if (error) {
      console.error('사용자 통계 조회 오류:', error);
      return {};
    }
    
    return stats;
  } catch (error) {
    console.error('getUserStatsByProvider 오류:', error);
    return {};
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  getUserBySocialId,
  getUserByEmail,
  getUserStatsByProvider
}; 